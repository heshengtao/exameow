import type { AIConfig, AnswerResult, ExamParams, ExplainParams, ExplainResult, JudgeParams, JudgeResult, ModelInfo } from '@exameow/shared'
import { tauriApi, type GenerateResult as TauriGenerateResult } from './bridge'
import { httpApi, type GenerateResult as HttpGenerateResult, type ServerConfigInfo } from './http'
import { cfApi } from './cf'

let _isTauri: boolean | null = null
let _isCloudflare: boolean | null = null

function isTauri(): boolean {
  if (_isTauri === null) {
    _isTauri = '__TAURI__' in window || '__TAURI_INTERNALS__' in window
  }
  return _isTauri
}

function isCloudflare(): boolean {
  if (_isCloudflare === null) {
    _isCloudflare = import.meta.env.VITE_CLOUDFLARE === 'true'
  }
  return _isCloudflare
}

export const api = {
  async getModels(config: AIConfig): Promise<ModelInfo[]> {
    if (isTauri()) {
      return tauriApi.getModels(config.endpoint, config.api_key)
    }
    if (isCloudflare()) {
      if (config.endpoint && config.api_key) {
        return httpApi.getModels(config.endpoint, config.api_key)
      }
      return cfApi.getModels()
    }
    return httpApi.getModels(config.endpoint, config.api_key)
  },

  async generateExam(
    fileOrPath: File | string,
    params: ExamParams,
    config: AIConfig,
    signal?: AbortSignal,
  ): Promise<{ questions: import('@exameow/shared').Question[] }> {
    if (isTauri()) {
      return tauriApi.generateExam(
        fileOrPath as string,
        params,
        config.endpoint,
        config.api_key,
        config.model,
        signal,
        config.options,
      )
    }
    if (isCloudflare()) {
      return cfApi.generateExam(fileOrPath as File, params, config, signal)
    }
    return httpApi.generateExam(fileOrPath as File, params, config, signal)
  },

  async answerQuestion(
    question: string,
    language: string,
    config: AIConfig,
    signal?: AbortSignal,
  ): Promise<AnswerResult> {
    if (isTauri()) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      return tauriApi.answerQuestion(question, language, config.endpoint, config.api_key, config.model, config.options)
    }
    if (isCloudflare()) {
      return cfApi.answerQuestion(question, language, config, signal)
    }
    return httpApi.answerQuestion(question, language, config, signal)
  },

  async judgeAnswer(
    params: JudgeParams,
    language: string,
    config: AIConfig,
    signal?: AbortSignal,
  ): Promise<JudgeResult> {
    if (isTauri()) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      return tauriApi.judgeAnswer(params, language, config.endpoint, config.api_key, config.model, config.options)
    }
    if (isCloudflare()) {
      return cfApi.judgeAnswer(params, language, config, signal)
    }
    return httpApi.judgeAnswer(params, language, config, signal)
  },

  async explainQuestion(
    params: ExplainParams,
    language: string,
    config: AIConfig,
    signal?: AbortSignal,
  ): Promise<ExplainResult> {
    if (isTauri()) {
      if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
      return tauriApi.explainQuestion(params, language, config.endpoint, config.api_key, config.model, config.options)
    }
    if (isCloudflare()) {
      return cfApi.explainQuestion(params, language, config, signal)
    }
    return httpApi.explainQuestion(params, language, config, signal)
  },

  async exportCsv(
    questions: import('@exameow/shared').Question[],
    savePath?: string,
    filename?: string,
  ): Promise<void> {
    if (isTauri()) {
      return tauriApi.exportCsv(questions, savePath!)
    }
    if (isCloudflare()) {
      return cfApi.exportCsv(questions, filename)
    }
    return httpApi.exportCsv(questions, filename)
  },

  async exportXlsx(
    questions: import('@exameow/shared').Question[],
    savePath?: string,
    filename?: string,
  ): Promise<void> {
    if (isTauri()) {
      return tauriApi.exportXlsx(questions, savePath!)
    }
    if (isCloudflare()) {
      return cfApi.exportXlsx(questions, filename)
    }
    return httpApi.exportXlsx(questions, filename)
  },

  async exportXlsxData(
    questions: import('@exameow/shared').Question[],
  ): Promise<string> {
    return tauriApi.exportXlsxData(questions)
  },

  async saveConfig(config: AIConfig): Promise<void> {
    if (isTauri()) {
      return tauriApi.saveConfig(config)
    }
    if (isCloudflare()) {
      return cfApi.saveConfig(config)
    }
    return httpApi.saveConfig(config)
  },

  async loadConfig(): Promise<AIConfig | null> {
    if (isTauri()) {
      return tauriApi.loadConfig()
    }
    if (isCloudflare()) {
      return cfApi.loadConfig()
    }
    return httpApi.loadConfig()
  },

  async getServerInfo(): Promise<ServerConfigInfo | null> {
    if (isTauri() || isCloudflare()) return null
    return httpApi.getServerInfo()
  },

  async captureScreen(x: number, y: number, w: number, h: number, force = false): Promise<Uint8Array> {
    if (!isTauri()) {
      throw new Error('Screen capture is only available in the desktop/mobile app')
    }
    return tauriApi.captureScreen(x, y, w, h, force)
  },

  async createRecordWindows(): Promise<void> {
    if (!isTauri()) throw new Error('Not available on this platform')
    return tauriApi.createRecordWindows()
  },

  async closeRecordWindows(): Promise<void> {
    if (!isTauri()) throw new Error('Not available on this platform')
    return tauriApi.closeRecordWindows()
  },

  async openAppSettings(): Promise<void> {
    if (!isTauri()) throw new Error('Not available on this platform')
    return tauriApi.openAppSettings()
  },

  async resizeRecordOverlay(w: number, h: number): Promise<void> {
    if (!isTauri()) throw new Error('Not available on this platform')
    return tauriApi.resizeRecordOverlay(w, h)
  },

  async checkScreenPermission(): Promise<boolean> {
    if (!isTauri()) return true
    return tauriApi.checkScreenPermission()
  },

  async requestScreenPermission(): Promise<boolean> {
    if (!isTauri()) return true
    return tauriApi.requestScreenPermission()
  },

  async openScreenRecordingSettings(): Promise<void> {
    if (!isTauri()) return
    return tauriApi.openScreenRecordingSettings()
  },
}
