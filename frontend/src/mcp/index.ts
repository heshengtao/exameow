import { registerAppTools } from './handlers/app'
import { registerBankTools } from './handlers/banks'
import { registerExamTools } from './handlers/exam'
import { registerPracticeTools } from './handlers/practice'
import { registerUiTools } from './handlers/ui'

export {
  mcpBridgeConnected,
  mcpBridgeInfo,
  refreshMcpBridge,
  startMcpBridge,
  stopMcpBridge,
} from './bridge'
export { listMcpTools } from './registry'

let registered = false

/** Registers every tool this build can serve to an MCP client. */
export function registerDefaultMcpTools(): void {
  if (registered) return
  registered = true
  registerAppTools()
  registerBankTools()
  registerPracticeTools()
  registerExamTools()
  registerUiTools()
}
