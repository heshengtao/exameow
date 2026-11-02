#!/usr/bin/env node
/**
 * Mirror one GitHub Release (metadata + asset files) to GitCode.
 *
 * GitHub stays the source of truth; GitCode gets a read-only copy so users in
 * mainland China can download the installers at a usable speed.
 *
 * Required env:
 *   GITCODE_TOKEN  personal access token from https://gitcode.com/setting/token-classic
 *   GITCODE_REPO   GitCode repository path, e.g. "heshengtao/exameow"
 *   TAG            release tag, e.g. "v1.7.5"
 *
 * Optional env:
 *   ASSETS_DIR     directory holding the release files       (default: dist)
 *   GITCODE_API    API base                                  (default: https://api.gitcode.com/api/v5)
 *   GH_REPO        GitHub repo "owner/name" (default: $GITHUB_REPOSITORY)
 *   GITHUB_TOKEN   token used to read the GitHub release     (default: $GH_TOKEN)
 *   RELEASE_NAME / RELEASE_BODY / PRERELEASE  skip the GitHub API (useful locally)
 *   DRY_RUN=1      print the plan, never write to GitCode
 *
 * Local usage:
 *   GITCODE_TOKEN=xxx GITCODE_REPO=heshengtao/exameow TAG=v1.7.5 \
 *     ASSETS_DIR=dist DRY_RUN=1 node scripts/sync-gitcode-release.mjs
 *
 * Behaviour on re-runs is idempotent: release metadata is patched, assets that
 * already exist with the same size are skipped, mismatched ones are replaced.
 *
 * "latest.json" and "*.idsig" stay GitHub-only: the former points at GitHub
 * URLs, the latter is Android's v4 signature, and GitCode (like Gitee) caps a
 * release at roughly 20 attachments while v1.7.5 ships 21 files.
 */

import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

const API = (process.env.GITCODE_API || 'https://api.gitcode.com/api/v5').replace(/\/+$/, '');
const TOKEN = process.env.GITCODE_TOKEN || '';
const REPO = process.env.GITCODE_REPO || '';
const TAG = process.env.TAG || '';
const ASSETS_DIR = process.env.ASSETS_DIR || 'dist';
const GH_REPO = process.env.GH_REPO || process.env.GITHUB_REPOSITORY || '';
const GH_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
const DRY_RUN = process.env.DRY_RUN === '1';

const API_TIMEOUT_MS = 60_000;
const UPLOAD_TIMEOUT_MS = 15 * 60_000;
const CREATE_ATTEMPTS = 10;
const CREATE_RETRY_MS = 30_000;

const repoPath = REPO.split('/').filter(Boolean).map(encodeURIComponent).join('/');
const tagPath = encodeURIComponent(TAG);

function die(message) {
  console.error(`\n[error] ${message}\n`);
  process.exit(1);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function short(text, limit = 400) {
  const value = typeof text === 'string' ? text : JSON.stringify(text);
  if (!value) return '';
  return value.length > limit ? `${value.slice(0, limit)}…` : value;
}

/** GitCode API call. Falls back to ?access_token= when the header is not honoured. */
async function gc(path, { method = 'GET', body, expect = [200, 201] } = {}) {
  const url = `${API}${path}`;
  const init = {
    method,
    headers: {
      Accept: 'application/json',
      'PRIVATE-TOKEN': TOKEN,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  };

  let res = await fetch(url, init);
  if (res.status === 401) {
    // A few GitCode endpoints still only read the token from the query string.
    const sep = url.includes('?') ? '&' : '?';
    res = await fetch(`${url}${sep}access_token=${encodeURIComponent(TOKEN)}`, init);
  }

  const text = await res.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!expect.includes(res.status)) {
    const error = new Error(
      `GitCode ${method} ${path} -> HTTP ${res.status}: ${short(text)}`,
    );
    error.status = res.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function getRelease() {
  try {
    return await gc(`/repos/${repoPath}/releases/${tagPath}`, { expect: [200] });
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

function releaseStatus(prerelease) {
  return prerelease ? 'pre' : 'latest';
}

async function githubJson(path) {
  const res = await fetch(`https://api.github.com/repos/${GH_REPO}${path}`, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(GH_TOKEN ? { Authorization: `Bearer ${GH_TOKEN}` } : {}),
    },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`GitHub GET ${path} -> HTTP ${res.status}: ${short(text)}`);
  }
  return JSON.parse(text);
}

/** Resolve the commit the tag points at (annotated tags need one extra hop). */
async function tagCommitSha() {
  const ref = await githubJson(`/git/ref/tags/${encodeURIComponent(TAG)}`);
  let object = ref.object;
  if (object?.type === 'tag') {
    const annotated = await githubJson(`/git/tags/${object.sha}`);
    object = annotated.object;
  }
  return object?.sha || '';
}

async function releaseMetadata() {
  if (process.env.RELEASE_BODY !== undefined || process.env.RELEASE_NAME !== undefined) {
    return {
      name: process.env.RELEASE_NAME || TAG,
      body: process.env.RELEASE_BODY || '',
      prerelease: process.env.PRERELEASE === '1',
      targetCommitish: process.env.TARGET_COMMITISH || '',
    };
  }
  if (!GH_REPO) die('GH_REPO (or GITHUB_REPOSITORY) is required to read the GitHub release');

  const release = await githubJson(`/releases/tags/${encodeURIComponent(TAG)}`);
  let targetCommitish = '';
  try {
    targetCommitish = await tagCommitSha();
  } catch (error) {
    console.warn(`[warn] could not resolve tag commit: ${error.message}`);
  }
  return {
    name: release.name || TAG,
    body: release.body || '',
    prerelease: Boolean(release.prerelease),
    targetCommitish,
  };
}

function withMirrorNote(body) {
  const note =
    `> 📦 本页附件与 GitHub Release 同步发布（国内下载请直接使用下方附件）。` +
    (GH_REPO ? `\n> GitHub 原版：https://github.com/${GH_REPO}/releases/tag/${TAG}` : '');
  if (body.includes('本页附件与 GitHub Release 同步发布')) return body;
  return body ? `${body}\n\n---\n\n${note}` : note;
}

async function ensureRelease(meta) {
  const existing = await getRelease();
  const payload = {
    name: meta.name,
    body: withMirrorNote(meta.body),
    release_status: releaseStatus(meta.prerelease),
  };

  const update = async (current) => {
    console.log(`[release] updating existing release ${TAG}`);
    if (DRY_RUN) return current;
    return gc(`/repos/${repoPath}/releases/${tagPath}`, {
      method: 'PATCH',
      body: payload,
      expect: [200],
    });
  };

  if (existing) return update(existing);

  const createPayload = {
    tag_name: TAG,
    ...payload,
    ...(meta.targetCommitish ? { target_commitish: meta.targetCommitish } : {}),
  };

  for (let attempt = 1; attempt <= CREATE_ATTEMPTS; attempt += 1) {
    console.log(`[release] creating release ${TAG} (attempt ${attempt}/${CREATE_ATTEMPTS})`);
    if (DRY_RUN) return { tag_name: TAG, assets: [] };
    try {
      return await gc(`/repos/${repoPath}/releases`, {
        method: 'POST',
        body: createPayload,
        expect: [200, 201],
      });
    } catch (error) {
      // A concurrent run (or a retry whose first request actually landed) may
      // have created the release already.
      if ([400, 409, 422].includes(error.status)) {
        const created = await getRelease().catch(() => null);
        if (created) return update(created);
      }
      // The pull mirror may not have delivered the tag/commit yet.
      const retryable = [400, 404, 409, 422].includes(error.status);
      if (!retryable || attempt === CREATE_ATTEMPTS) {
        if (retryable) {
          error.message +=
            `\nGitCode 上还看不到 tag ${TAG} 或它指向的 commit。请先在 GitCode 项目设置 → 仓库镜像里` +
            `确认 Pull 镜像已同步（或手动推送该 tag），然后重跑此任务。`;
        }
        throw error;
      }
      console.warn(`[release] ${error.message}`);
      console.warn(`[release] tag/commit not visible on GitCode yet, retry in ${CREATE_RETRY_MS / 1000}s`);
      await sleep(CREATE_RETRY_MS);
    }
  }
  throw new Error('unreachable');
}

function uploadHeaders(headers) {
  const out = {};
  for (const [key, value] of Object.entries(headers || {})) {
    const lower = key.toLowerCase();
    // fetch computes these itself; forwarding them breaks the signed PUT.
    if (['host', 'content-length', 'connection', 'transfer-encoding'].includes(lower)) continue;
    out[key] = String(value);
  }
  return out;
}

async function uploadAsset(file, remoteAssets) {
  const name = basename(file);
  const info = await stat(file);
  const existing = remoteAssets.get(name);

  if (existing && Number(existing.size) === info.size) {
    console.log(`[asset] ${name} already present (${info.size} bytes), skipping`);
    return 'skipped';
  }

  if (DRY_RUN) {
    console.log(`[asset] ${name} (${info.size} bytes) would be uploaded${existing ? ' (replacing)' : ''}`);
    return 'planned';
  }

  if (existing) {
    const id = existing.id ?? existing.attach_file_id;
    if (id === undefined) throw new Error(`cannot replace ${name}: attachment id missing`);
    console.log(`[asset] ${name} exists with a different size, deleting attachment ${id}`);
    await gc(`/repos/${repoPath}/releases/${tagPath}/attach_files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      expect: [200, 202, 204],
    });
  }

  const query = new URLSearchParams({ file_name: name });
  const descriptor = await gc(`/repos/${repoPath}/releases/${tagPath}/upload_url?${query}`);
  if (!descriptor?.url || !descriptor.headers) {
    throw new Error(`GitCode returned an invalid upload descriptor for ${name}`);
  }

  const data = await readFile(file);
  console.log(`[asset] uploading ${name} (${info.size} bytes) …`);
  const res = await fetch(descriptor.url, {
    method: 'PUT',
    headers: uploadHeaders(descriptor.headers),
    body: data,
    signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`upload ${name} failed: HTTP ${res.status} ${short(text)}`);
  }
  console.log(`[asset] ${name} uploaded`);
  return 'uploaded';
}

async function main() {
  if (!TOKEN) die('GITCODE_TOKEN is not set (create one at https://gitcode.com/setting/token-classic)');
  if (!REPO || !REPO.includes('/')) die('GITCODE_REPO must look like "owner/repo"');
  if (!TAG) die('TAG is not set');

  console.log(`[gitcode] repo=${REPO} tag=${TAG} api=${API}${DRY_RUN ? ' (dry run)' : ''}`);

  const meta = await releaseMetadata();
  if (meta.targetCommitish) console.log(`[gitcode] tag commit: ${meta.targetCommitish}`);

  const release = await ensureRelease(meta);

  const remoteAssets = new Map();
  for (const asset of release?.assets || []) {
    if (asset.type === 'source') continue;
    remoteAssets.set(asset.name || asset.file_name, asset);
  }

  // GitCode and Gitee share an attachment cap (roughly 20 per release) and
  // v1.7.5 already ships 21 files. Drop the two that are meaningless on a mirror:
  // latest.json points at GitHub URLs, *.idsig is the Android v4 signature.
  const ignored = [/\.idsig$/i, /^latest\.json$/i];

  let files = [];
  try {
    files = (await readdir(ASSETS_DIR, { withFileTypes: true }))
      .filter((entry) => entry.isFile())
      .filter((entry) => {
        if (!ignored.some((pattern) => pattern.test(entry.name))) return true;
        console.log(`[asset] skipping ${entry.name} (not mirrored)`);
        return false;
      })
      .map((entry) => join(ASSETS_DIR, entry.name))
      .sort();
  } catch (error) {
    die(`cannot read ASSETS_DIR ${ASSETS_DIR}: ${error.message}`);
  }
  if (files.length === 0) die(`no files found in ${ASSETS_DIR}`);

  const summary = { uploaded: 0, skipped: 0, planned: 0 };
  for (const file of files) {
    const outcome = await uploadAsset(file, remoteAssets);
    if (outcome === 'uploaded') summary.uploaded += 1;
    else if (outcome === 'skipped') summary.skipped += 1;
    else summary.planned += 1;
  }

  console.log(
    `[gitcode] done: ${summary.uploaded} uploaded, ${summary.skipped} skipped, ${summary.planned} planned`,
  );
  if (!DRY_RUN && GH_REPO) {
    const page = release?.html_url || `https://gitcode.com/${REPO}/releases/tag/${TAG}`;
    console.log(`[gitcode] release page: ${page}`);
  }
}

main().catch((error) => {
  die(error.stack || error.message || String(error));
});
