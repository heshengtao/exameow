export type McpToolHandler = (args: Record<string, any>) => unknown | Promise<unknown>

const handlers = new Map<string, McpToolHandler>()

export class McpToolError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.name = 'McpToolError'
    this.code = code
  }
}

export function registerMcpTool(name: string, handler: McpToolHandler): void {
  handlers.set(name, handler)
}

export function hasMcpTool(name: string): boolean {
  return handlers.has(name)
}

export function listMcpTools(): string[] {
  return [...handlers.keys()].sort()
}

export function dispatchMcpTool(tool: string, args: Record<string, unknown>): Promise<unknown> {
  const handler = handlers.get(tool)
  if (!handler) {
    return Promise.reject(
      new McpToolError('tool_not_supported', `Tool \`${tool}\` is not available in this app build`),
    )
  }
  return Promise.resolve(handler(args ?? {}))
}
