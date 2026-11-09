import DOMPurify from 'dompurify'
import MarkdownIt from 'markdown-it'
import katexPlugin from '@vscode/markdown-it-katex'
import footnote from 'markdown-it-footnote'
import taskLists from 'markdown-it-task-lists'
import mark from 'markdown-it-mark'
import sub from 'markdown-it-sub'
import sup from 'markdown-it-sup'
import katex from 'katex'
import 'katex/contrib/mhchem'
import hljs from 'highlight.js/lib/common'
import { encodeDiagramSource } from './mermaid'

/**
 * Markdown → sanitized HTML for every AI-authored surface (chat replies,
 * question stems, options, answers and analyses).
 *
 * The feature set mirrors what a model actually emits: GFM (tables, task
 * lists, strikethrough, linkified bare URLs, footnotes), TeX math through
 * KaTeX, and highlighted code fences. Raw HTML stays literal (`html: false`),
 * exactly like the harness this app is developed against, so untrusted model
 * output never enters the DOM before DOMPurify sees it.
 *
 * Math is rendered to a placeholder first and swapped in after sanitizing:
 * DOMPurify's MathML hardening strips `<semantics>`/`<annotation>` and would
 * leak raw TeX into the accessible tree. KaTeX output is generated locally
 * with `trust: false`, so it is safe to inject afterwards.
 */

export interface MarkdownRenderOptions {
  /** While a reply streams, math is left literal so half-finished TeX never flashes KaTeX errors. */
  streaming?: boolean
  /** Localized copy-button chrome. */
  copyLabel?: string
  copiedLabel?: string
}

interface PendingMath {
  tex: string
  display: boolean
}

const DEFAULT_COPY_LABEL = 'Copy code'
const DEFAULT_COPIED_LABEL = 'Copied'

/** Languages whose fence content is a display-math formula rather than code. */
const MATH_FENCE_LANGS = new Set(['math', 'latex', 'tex', 'katex'])

const PURIFY_OPTIONS = {
  USE_PROFILES: { html: true },
  ADD_ATTR: ['target', 'rel', 'loading', 'decoding', 'aria-label'],
}

/** CJS/ESM interop: some bundlers hand back `{ default: plugin }`. */
function pluginOf<T>(module: T): T {
  return (module as unknown as { default?: T }).default ?? module
}

interface MarkdownEngine {
  render(text: string, options: MarkdownRenderOptions): string
  renderInline(text: string, options: MarkdownRenderOptions): string
}

/**
 * GFM + math delimiters. `@vscode/markdown-it-katex` only understands `$…$`
 * and `$$…$$`, so {@link normalizeMathDelimiters} rewrites the
 * `\(…\)` / `\[…\]` forms many models prefer before parsing.
 */
function createEngine(withMath: boolean, withDiagrams: boolean): MarkdownEngine {
  const md = new MarkdownIt({
    html: false,
    linkify: true,
    breaks: true,
    typographer: false,
  })

  md.use(pluginOf(footnote))
  md.use(pluginOf(taskLists), { enabled: false, label: true, labelAfter: true })
  md.use(pluginOf(mark))
  md.use(pluginOf(sub))
  md.use(pluginOf(sup))

  const pending: PendingMath[] = []

  const mathPlaceholder = (tex: string, display: boolean): string => {
    if (!withMath) return `<code>${md.utils.escapeHtml(tex)}</code>`
    const index = pending.push({ tex, display }) - 1
    return `<span data-md-math="${index}"${display ? ' data-md-display="1"' : ''}></span>`
  }

  if (withMath) {
    md.use(pluginOf(katexPlugin), {
      throwOnError: false,
      enableBareBlocks: true,
    })
    // Replace every KaTeX renderer with a placeholder; the real formula is
    // injected after sanitization.
    md.renderer.rules.math_inline = (tokens, idx) =>
      mathPlaceholder(tokens[idx]?.content ?? '', false)
    md.renderer.rules.math_block = (tokens, idx) =>
      mathPlaceholder(tokens[idx]?.content ?? '', true)
    md.renderer.rules.math_inline_block = (tokens, idx) =>
      mathPlaceholder(tokens[idx]?.content ?? '', true)
    md.renderer.rules.math_inline_bare_block = (tokens, idx) =>
      mathPlaceholder(tokens[idx]?.content ?? '', true)
  }

  // Links leave the app: open externally, never expose the opener.
  md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
    const href = tokens[idx]?.attrGet('href') ?? ''
    if (!href.startsWith('#')) {
      tokens[idx]?.attrSet('target', '_blank')
      tokens[idx]?.attrSet('rel', 'noopener noreferrer')
    }
    return self.renderToken(tokens, idx, options)
  }

  const imageRule = md.renderer.rules.image
  md.renderer.rules.image = (tokens, idx, options, env, self) => {
    tokens[idx]?.attrSet('loading', 'lazy')
    tokens[idx]?.attrSet('decoding', 'async')
    return imageRule
      ? imageRule(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }

  // Wide tables scroll on their own instead of stretching the bubble.
  md.renderer.rules.table_open = () => '<div class="md-table-wrap"><table>\n'
  md.renderer.rules.table_close = () => '</table></div>\n'

  md.renderer.rules.fence = (tokens, idx) => {
    const token = tokens[idx]
    if (!token) return ''
    const info = (token.info || '').trim()
    const lang = /^[\w+#.-]+/.exec(info)?.[0]?.toLowerCase() ?? ''
    const source = token.content

    if (withMath && MATH_FENCE_LANGS.has(lang)) return `${mathPlaceholder(source.trim(), true)}\n`
    if (withDiagrams && lang === 'mermaid') {
      return `<div class="md-mermaid" data-mermaid="${encodeDiagramSource(source.trim())}"></div>\n`
    }

    const escapedLang = lang.replace(/[^\w-]/g, '')
    const grammar = escapedLang && hljs.getLanguage(escapedLang) ? escapedLang : ''
    let body: string
    try {
      body = grammar
        ? hljs.highlight(source, { language: grammar, ignoreIllegals: true }).value
        : md.utils.escapeHtml(source)
    } catch {
      body = md.utils.escapeHtml(source)
    }

    const langBadge = escapedLang
      ? `<span class="md-code-lang">${md.utils.escapeHtml(escapedLang)}</span>`
      : ''
    return (
      '<div class="md-code-block">' +
      `<div class="md-code-head">${langBadge}` +
      '<button type="button" class="md-code-copy" data-code-copy>Copy code</button>' +
      '</div>' +
      `<pre class="md-pre"><code class="hljs${grammar ? ` language-${grammar}` : ''}">${body}</code></pre>` +
      '</div>\n'
    )
  }

  const finalize = (html: string, options: MarkdownRenderOptions): string => {
    const labelled = localizeCopyButtons(html, options)
    const sanitized = DOMPurify.sanitize(labelled, PURIFY_OPTIONS)
    return sanitized.replace(
      /<span data-md-math="(\d+)"(?: data-md-display="1")?><\/span>/g,
      (_match, rawIndex: string) => {
        const item = pending[Number(rawIndex)]
        if (!item) return ''
        const formula = renderTex(item.tex, item.display)
        return item.display ? `<span class="md-math-block">${formula}</span>` : formula
      },
    )
  }

  return {
    render(text, options) {
      pending.length = 0
      return finalize(md.render(normalizeMathDelimiters(text)), options)
    },
    renderInline(text, options) {
      pending.length = 0
      return finalize(md.renderInline(normalizeMathDelimiters(text)), options)
    },
  }
}

function renderTex(source: string, displayMode: boolean): string {
  if (!source.trim()) return ''
  try {
    return katex.renderToString(source, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      trust: false,
    })
  } catch {
    return `<span class="katex-error">${escapeHtml(source)}</span>`
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const settled = createEngine(true, true)
const streaming = createEngine(false, false)
const inlineSettled = createEngine(true, false)

/** Render model-authored Markdown to sanitized HTML for `v-html`. */
export function renderMarkdown(text: string, options: MarkdownRenderOptions = {}): string {
  if (!text) return ''
  return options.streaming ? streaming.render(text, options) : settled.render(text, options)
}

/** Render a single line (option text, short answer) without block wrappers. */
export function renderInlineMarkdown(text: string, options: MarkdownRenderOptions = {}): string {
  if (!text) return ''
  return inlineSettled.renderInline(text, options)
}

function localizeCopyButtons(html: string, options: MarkdownRenderOptions): string {
  if (!html.includes('data-code-copy')) return html
  const copy = escapeHtml(options.copyLabel ?? DEFAULT_COPY_LABEL)
  const copied = escapeHtml(options.copiedLabel ?? DEFAULT_COPIED_LABEL)
  return html.replace(
    /<button type="button" class="md-code-copy" data-code-copy(?: data-copy-label="[^"]*")?>[^<]*<\/button>/g,
    `<button type="button" class="md-code-copy" data-code-copy data-copy-label="${copied}">${copy}</button>`,
  )
}

/* ------------------------------------------------------------------ *
 * `\(…\)` / `\[…\]` compatibility
 * ------------------------------------------------------------------ */

/**
 * Rewrite backslash-delimited TeX into the dollar delimiters the parser
 * understands, skipping fenced code blocks so code samples stay intact.
 */
export function normalizeMathDelimiters(source: string): string {
  const lines = source.split('\n')
  const out: string[] = []
  let fence: string | null = null
  let buffer: string[] = []

  const flush = () => {
    if (buffer.length === 0) return
    out.push(convertTextSegment(buffer.join('\n')))
    buffer = []
  }

  for (const line of lines) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1] ?? null
    if (fence) {
      out.push(line)
      const trimmed = line.trim()
      if (
        marker &&
        marker[0] === fence[0] &&
        trimmed.length >= fence.length &&
        /^(`+|~+)$/.test(trimmed)
      ) {
        fence = null
      }
      continue
    }
    if (marker) {
      flush()
      fence = marker
      out.push(line)
      continue
    }
    buffer.push(line)
  }
  flush()
  return out.join('\n')
}

function convertTextSegment(text: string): string {
  let result = ''
  let last = 0
  const codeSpan = /(`+)([\s\S]*?)\1/g
  let match: RegExpExecArray | null
  while ((match = codeSpan.exec(text)) !== null) {
    result += convertDelimiters(text.slice(last, match.index))
    result += match[0]
    last = match.index + match[0].length
  }
  result += convertDelimiters(text.slice(last))
  return result
}

function convertDelimiters(segment: string): string {
  if (!segment.includes('\\(') && !segment.includes('\\[')) return segment
  return segment
    .replace(/(^|[^\\])\\\[([\s\S]+?)\\\]/g, (_match, prefix: string, body: string) => {
      return `${prefix}\n\n$$\n${body.trim()}\n$$\n\n`
    })
    .replace(/(^|[^\\])\\\(/g, (_match, prefix: string) => `${prefix}$`)
    .replace(/\\\)/g, () => '$')
}
