import { useConfigStore } from '@/stores/config'
import { usePracticeStore } from '@/stores/practice'
import { isCloudflare, isMobileDevice, isTauri } from '@/utils/platform'
import { listMcpTools, registerMcpTool } from '../registry'

export function registerAppTools(): void {
  registerMcpTool('app_status', () => {
    const config = useConfigStore()
    const practice = usePracticeStore()
    const session = practice.session
    const platform = isTauri()
      ? isMobileDevice()
        ? 'tauri-mobile'
        : 'tauri-desktop'
      : isCloudflare()
        ? 'cloudflare'
        : 'web'
    return {
      platform,
      app_version: import.meta.env.VITE_APP_VERSION ?? null,
      ai_configured: config.configured,
      ai_provider: config.aiProvider,
      model: config.model || null,
      bank_count: practice.banks.length,
      active_bank_id: session?.bankId ?? null,
      active_session: session
        ? {
            bank_id: session.bankId,
            mode: session.mode,
            index: session.currentIndex,
            total: session.questions.length,
            answered: practice.answeredCount,
            finished_at: session.finishedAt,
          }
        : null,
      implemented_tools: listMcpTools(),
    }
  })
}
