import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { McpInfo } from '@exameow/shared'
import { isCloudflare, isTauri } from '@/utils/platform'
import { mcpBridgeConnected, refreshMcpBridge } from '@/mcp'

export const useMcpStore = defineStore('mcp', () => {
  const info = ref<McpInfo | null>(null)
  const loading = ref(false)
  const error = ref('')
  const isNative = isTauri()
  const available = !isCloudflare()

  async function load(): Promise<void> {
    if (!available) return
    loading.value = true
    error.value = ''
    try {
      if (isNative) {
        const { invoke } = await import('@tauri-apps/api/core')
        info.value = await invoke<McpInfo>('mcp_info')
      } else {
        const response = await fetch('/api/mcp/info', { headers: { Accept: 'application/json' } })
        info.value = response.ok ? ((await response.json()) as McpInfo) : null
        if (!response.ok) error.value = `HTTP ${response.status}`
      }
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      info.value = null
    } finally {
      loading.value = false
    }
  }

  async function setEnabled(
    enabled: boolean,
    port?: number,
    allowLan?: boolean,
  ): Promise<void> {
    if (!available) return
    if (!isNative) {
      throw new Error('This server manages MCP through MCP_ENABLED')
    }
    loading.value = true
    error.value = ''
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      info.value = await invoke<McpInfo>('mcp_set_enabled', {
        enabled,
        port,
        allowLan,
      })
      refreshMcpBridge()
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  async function regenerateToken(): Promise<void> {
    if (!available || !isNative) return
    loading.value = true
    error.value = ''
    try {
      const { invoke } = await import('@tauri-apps/api/core')
      info.value = await invoke<McpInfo>('mcp_regenerate_token')
      refreshMcpBridge()
    } catch (e: any) {
      error.value = e?.message ?? String(e)
      throw e
    } finally {
      loading.value = false
    }
  }

  return {
    info,
    loading,
    error,
    isNative,
    available,
    connected: mcpBridgeConnected,
    load,
    setEnabled,
    regenerateToken,
  }
})
