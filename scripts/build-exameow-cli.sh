#!/usr/bin/env bash
# 把根 workspace 的 `exameow-cli` 编译出来，按 Tauri sidecar 的命名规则放进 src-tauri/binaries/。
#
# 为什么需要这一步：Tauri 的 `bundle.externalBin` 要求文件名带**目标三元组**后缀
# （macOS `exameow-cli-aarch64-apple-darwin`、Windows `exameow-cli-x86_64-pc-windows-msvc.exe`…），
# 打包时它会把后缀去掉、把二进制放到主程序旁边。
#
# 目标三元组优先级：TAURI_ENV_TARGET_TRIPLE（tauri 交叉编译时注入）→ EXAMEOW_TARGET → host。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

TARGET="${TAURI_ENV_TARGET_TRIPLE:-${EXAMEOW_TARGET:-}}"
if [ -z "${TARGET}" ]; then
  if TARGET="$(rustc --print host-tuple 2>/dev/null)" && [ -n "${TARGET}" ]; then
    :
  else
    TARGET="$(rustc -Vv | sed -n 's/^host: //p')"
  fi
fi
[ -n "${TARGET}" ] || {
  echo "无法确定目标三元组：请确认 rustc 在 PATH 上" >&2
  exit 1
}

EXE=""
case "${TARGET}" in
  *windows*) EXE=".exe" ;;
esac

echo "==> 构建 exameow-cli（${TARGET}）"
(cd "${ROOT}" && cargo build -p exameow-cli --release --target "${TARGET}")

SRC="${ROOT}/target/${TARGET}/release/exameow-cli${EXE}"
DST="${ROOT}/src-tauri/binaries/exameow-cli-${TARGET}${EXE}"
[ -f "${SRC}" ] || {
  echo "找不到构建产物：${SRC}" >&2
  exit 1
}

echo "==> 放置 sidecar：${DST}"
mkdir -p "$(dirname "${DST}")"
cp -f "${SRC}" "${DST}"
chmod +x "${DST}"
echo "==> 完成"
