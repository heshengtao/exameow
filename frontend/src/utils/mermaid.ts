/**
 * Lazy Mermaid integration for AI-authored diagrams.
 *
 * `mermaid` is a heavy dependency (and every diagram type pulls its own
 * chunk), so it is imported on demand: replies without a ```` ```mermaid ````
 * fence never pay for it. Rendering is serialized because Mermaid keeps
 * module-level state, and the theme is re-applied when it changes.
 */

import type { Mermaid } from 'mermaid'

const BASE_CONFIG = {
  startOnLoad: false,
  securityLevel: 'strict' as const,
  suppressErrorRendering: true,
  fontFamily:
    'ui-sans-serif, system-ui, -apple-system, "Segoe UI", "Noto Sans SC", sans-serif',
}

let mermaidPromise: Promise<Mermaid> | null = null
let renderChain: Promise<unknown> = Promise.resolve()
let currentTheme: 'default' | 'dark' | null = null
let renderSeq = 0

export function isDarkMode(): boolean {
  return document.documentElement.classList.contains('dark')
}

/** Encode diagram source for an HTML `data-` attribute (UTF-8 safe). */
export function encodeDiagramSource(source: string): string {
  const bytes = new TextEncoder().encode(source)
  let binary = ''
  const chunk = 0x8000
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
  }
  return btoa(binary)
}

export function decodeDiagramSource(encoded: string): string {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return new TextDecoder().decode(bytes)
}

async function loadMermaid(): Promise<Mermaid> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((module) => {
      const mermaid = module.default
      currentTheme = isDarkMode() ? 'dark' : 'default'
      mermaid.initialize({ ...BASE_CONFIG, theme: currentTheme })
      return mermaid
    })
    mermaidPromise.catch(() => {
      mermaidPromise = null
    })
  }
  return mermaidPromise
}

/** Render one diagram to SVG, serialized against Mermaid's shared state. */
export function renderMermaid(source: string): Promise<string> {
  const theme = isDarkMode() ? 'dark' : 'default'
  const run = async (): Promise<string> => {
    const mermaid = await loadMermaid()
    if (currentTheme !== theme) {
      currentTheme = theme
      mermaid.initialize({ ...BASE_CONFIG, theme })
    }
    renderSeq += 1
    const { svg } = await mermaid.render(`md-mermaid-${renderSeq}`, source)
    return svg
  }
  const task = renderChain.then(run, run)
  renderChain = task.catch(() => undefined)
  return task
}
