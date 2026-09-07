import { resolveAIOptions, type AIOptions } from './aiOptions'

export class AIHttpError extends Error {
  constructor(public status: number, body: string) {
    super(`HTTP ${status}: ${body}`)
  }
}

export function isRetryableAIError(error: unknown): boolean {
  return error instanceof AIHttpError
    ? error.status === 408 || error.status === 429 || error.status >= 500
    : error instanceof TypeError || (error instanceof Error && error.name === 'TimeoutError')
}

// The callback must consume the response body before resolving, so the timeout covers it too.
export async function runAIRequest<T>(
  request: (signal: AbortSignal) => Promise<T>,
  options?: Partial<AIOptions>,
  signal?: AbortSignal,
): Promise<T> {
  const o = resolveAIOptions(options)
  for (let attempt = 0; ; attempt++) {
    signal?.throwIfAborted()
    const controller = new AbortController()
    const cancel = () => controller.abort(signal?.reason)
    signal?.addEventListener('abort', cancel, { once: true })
    const timer = setTimeout(() => controller.abort(new DOMException(`AI request timed out after ${o.timeout_seconds}s`, 'TimeoutError')), o.timeout_seconds * 1000)
    try {
      return await request(controller.signal)
    } catch (error) {
      signal?.throwIfAborted()
      const cause = controller.signal.aborted ? controller.signal.reason : error
      if (attempt >= o.retries || !isRetryableAIError(cause)) throw cause
    } finally {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
    }
    // Bounded delay between transient failures; user cancellation interrupts the delay.
    await new Promise<void>((resolve, reject) => {
      const cancel = () => { clearTimeout(timer); reject(signal?.reason) }
      const timer = setTimeout(() => { signal?.removeEventListener('abort', cancel); resolve() }, 1000 * (attempt + 1))
      signal?.addEventListener('abort', cancel, { once: true })
      if (signal?.aborted) cancel()
    })
  }
}
