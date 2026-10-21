import router from '@/router'
import { McpToolError, registerMcpTool } from '../registry'
import { argString } from '../helpers'

const ROUTES = new Set([
  '/practice',
  '/generate',
  '/learn',
  '/search',
  '/search/text',
  '/mine',
  '/mine/config',
  '/mine/settings',
  '/mine/published',
  '/mine/joined',
  '/mine/records',
])

export function registerUiTools(): void {
  registerMcpTool('navigate', async (args) => {
    const route = argString(args, 'route', true)!
    if (!ROUTES.has(route)) {
      throw new McpToolError('invalid_args', `route must be one of ${[...ROUTES].join(', ')}`)
    }
    await router.push(route)
    return { ok: true, route }
  })
}
