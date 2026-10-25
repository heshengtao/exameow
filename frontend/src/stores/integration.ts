import { defineStore } from 'pinia'
import { ref } from 'vue'
import { isDesktopTauri } from '@/utils/platform'

export type CliState = 'installed' | 'missing' | 'conflict' | 'system' | 'unsupported'
export type CliHint = 'dev_build' | 'appimage' | 'needs_manual'

export interface CliStatus {
  state: CliState
  command: string
  target?: string | null
  bundled?: string | null
  conflict?: string | null
  hint?: CliHint | null
  manual_command?: string | null
  full_path?: string | null
}

export const useIntegrationStore = defineStore('integration', () => {
  const available = isDesktopTauri()
  const cli = ref<CliStatus | null>(null)
  const loading = ref(false)
  const error = ref('')

  async function invoke<T>(command: string): Promise<T> {
    const { invoke: tauriInvoke } = await import('@tauri-apps/api/core')
    return tauriInvoke<T>(command)
  }

  async function load(): Promise<void> {
    if (!available) return
    loading.value = true
    error.value = ''
    try {
      cli.value = await invoke<CliStatus>('cli_status')
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      cli.value = null
    } finally {
      loading.value = false
    }
  }

  async function run<T>(action: () => Promise<T>, apply: (value: T) => void): Promise<void> {
    loading.value = true
    error.value = ''
    try {
      apply(await action())
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  function installCli(): Promise<void> {
    return run(() => invoke<CliStatus>('install_cli'), value => (cli.value = value))
  }

  function uninstallCli(): Promise<void> {
    return run(() => invoke<CliStatus>('uninstall_cli'), value => (cli.value = value))
  }

  return {
    available,
    cli,
    loading,
    error,
    load,
    installCli,
    uninstallCli,
  }
})
