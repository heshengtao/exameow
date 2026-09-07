import { invoke } from '@tauri-apps/api/core'
import type { AIConfig, AnswerResult, ExamParams, ExplainParams, ExplainResult, JudgeParams, JudgeResult, ModelInfo, Question } from '@exameow/shared'

export interface GenerateResult {
  questions: Question[]
}

export interface OtaStatus {
  status: string
  version: string | null
  error: string | null
}

async function invokeAI<T>(command: string, args: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  signal?.throwIfAborted()
  const requestId = crypto.randomUUID()
  const pending = invoke<T>(command, { ...args, requestId })
  const cancel = () => { void invoke('cancel_ai_request', { requestId }).catch(console.error) }
  signal?.addEventListener('abort', cancel, { once: true })
  try {
    const result = await pending
    signal?.throwIfAborted()
    return result
  } catch (error) {
    signal?.throwIfAborted()
    throw error
  } finally {
    signal?.removeEventListener('abort', cancel)
  }
}

export const tauriApi = {
  async parseFileText(filePath: string): Promise<string> {
    return invoke<string>('parse_file_text', { filePath })
  },

  async parseFileBytes(base64Data: string, fileExt: string): Promise<string> {
    return invoke<string>('parse_file_bytes', { base64Data, fileExt })
  },

  async getModels(endpoint: string, apiKey: string): Promise<ModelInfo[]> {
    return invoke<ModelInfo[]>('get_models', { endpoint, apiKey })
  },

  async generateExam(
    filePath: string,
    params: ExamParams,
    endpoint: string,
    apiKey: string,
    model: string,
    signal?: AbortSignal,
    options?: AIConfig['options'],
  ): Promise<GenerateResult> {
    if (signal?.aborted) throw new DOMException('Cancelled', 'AbortError')
    const fpType = typeof filePath
    const fpVal = fpType === 'string' ? filePath : JSON.stringify(filePath)
    console.log('[bridge] generateExam filePath type:', fpType, 'val:', fpVal)
    const safePath = typeof filePath === 'string' ? filePath : String(filePath || 'file')
    console.log('[bridge] safePath:', safePath)
    try {
      return await invokeAI<GenerateResult>('generate_exam', {
        filePath: safePath,
        paramsJson: JSON.stringify(params),
        endpoint,
        apiKey,
        model,
        options,
      }, signal)
    } catch (e: any) {
      signal?.throwIfAborted()
      const detail = `[DIAG] filePath type=${fpType} val=${fpVal} safePath=${safePath} | ${e?.message || e}`
      console.error(detail)
      throw new Error(detail)
    }
  },

  async exportCsv(questions: Question[], savePath: string): Promise<void> {
    return invoke<void>('export_csv', { questionsJson: JSON.stringify(questions), savePath })
  },

  async exportXlsx(questions: Question[], savePath: string): Promise<void> {
    return invoke<void>('export_xlsx', { questionsJson: JSON.stringify(questions), savePath })
  },

  async exportXlsxData(questions: Question[]): Promise<string> {
    return invoke<string>('export_xlsx_data', { questionsJson: JSON.stringify(questions) })
  },

  async writeFile(savePath: string, contentBase64: string): Promise<void> {
    return invoke<void>('write_file', { savePath, contentBase64 })
  },

  async saveToCache(filename: string, contentBase64: string): Promise<string> {
    return invoke<string>('save_to_cache', { filename, contentBase64 })
  },

  async otaCheck(): Promise<OtaStatus> {
    return invoke<OtaStatus>('ota_check')
  },

  async otaDownload(): Promise<OtaStatus> {
    return invoke<OtaStatus>('ota_download')
  },

  async otaNotifyReady(): Promise<void> {
    return invoke<void>('ota_notify_ready')
  },

  async otaCurrent(): Promise<OtaStatus> {
    return invoke<OtaStatus>('ota_current')
  },

  async otaReset(): Promise<void> {
    return invoke<void>('ota_reset')
  },

  async saveToDownloads(filename: string, contentBase64: string): Promise<string> {
    return invoke<string>('save_to_downloads', { filename, contentBase64 })
  },

  async answerQuestion(
    question: string,
    language: string,
    endpoint: string,
    apiKey: string,
    model: string,
    options?: AIConfig['options'],
    signal?: AbortSignal,
  ): Promise<AnswerResult> {
    return invokeAI<AnswerResult>('answer_question', { question, language, endpoint, apiKey, model, options }, signal)
  },

  async judgeAnswer(
    params: JudgeParams,
    language: string,
    endpoint: string,
    apiKey: string,
    model: string,
    options?: AIConfig['options'],
    signal?: AbortSignal,
  ): Promise<JudgeResult> {
    return invokeAI<JudgeResult>('judge_answer', {
      stem: params.stem,
      referenceAnswer: params.reference_answer,
      analysis: params.analysis ?? '',
      userAnswer: params.user_answer,
      language,
      endpoint,
      apiKey,
      model,
      options,
    }, signal)
  },

  async explainQuestion(
    params: ExplainParams,
    language: string,
    endpoint: string,
    apiKey: string,
    model: string,
    options?: AIConfig['options'],
    signal?: AbortSignal,
  ): Promise<ExplainResult> {
    return invokeAI<ExplainResult>('explain_question', {
      stem: params.stem,
      referenceAnswer: params.reference_answer,
      analysis: params.analysis ?? '',
      language,
      endpoint,
      apiKey,
      model,
      options,
    }, signal)
  },

  async saveConfig(config: AIConfig): Promise<void> {
    return invoke<void>('save_config', { endpoint: config.endpoint, apiKey: config.api_key, model: config.model })
  },

  async loadConfig(): Promise<AIConfig | null> {
    return invoke<AIConfig | null>('load_config')
  },

  async captureScreen(x: number, y: number, w: number, h: number, force = false): Promise<Uint8Array> {
    const res = await invoke<Uint8Array | ArrayBuffer | number[]>('capture_screen', {
      x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), force,
    })
    if (res instanceof Uint8Array) return res
    if (res instanceof ArrayBuffer) return new Uint8Array(res)
    return new Uint8Array(res)
  },

  async createRecordWindows(): Promise<void> {
    return invoke<void>('create_record_windows')
  },

  async closeRecordWindows(): Promise<void> {
    return invoke<void>('close_record_windows')
  },

  async resizeRecordOverlay(w: number, h: number): Promise<void> {
    return invoke<void>('resize_record_overlay', { w, h })
  },

  async openAppSettings(): Promise<void> {
    return invoke<void>('open_app_settings')
  },

  async checkScreenPermission(): Promise<boolean> {
    return invoke<boolean>('check_screen_permission')
  },

  async requestScreenPermission(): Promise<boolean> {
    return invoke<boolean>('request_screen_permission')
  },

  async openScreenRecordingSettings(): Promise<void> {
    return invoke<void>('open_screen_recording_settings')
  },
}
