/**
 * Ambient types for markdown plugins that ship JavaScript only.
 */

declare module 'markdown-it-footnote' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it'
  interface TaskListOptions {
    /** Adds a `disabled` attribute to every checkbox (true by default). */
    enabled?: boolean
    /** Wraps the checkbox in a label. */
    label?: boolean
    /** Places the label after the item text. */
    labelAfter?: boolean
  }
  const plugin: MarkdownIt.PluginWithOptions<TaskListOptions>
  export default plugin
}

declare module 'highlight.js/lib/common' {
  import type { HLJSApi } from 'highlight.js'
  const hljs: HLJSApi
  export default hljs
}

declare module 'markdown-it-mark' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-sub' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'markdown-it-sup' {
  import type MarkdownIt from 'markdown-it'
  const plugin: MarkdownIt.PluginSimple
  export default plugin
}

declare module 'katex/contrib/mhchem' {
  const plugin: unknown
  export default plugin
}
