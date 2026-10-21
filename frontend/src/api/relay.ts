import type {
  ExamResultsResponse,
  PublishExamRequest,
  PublishExamResponse,
  PublishedExamInfo,
  SubmitExamRequest,
  SubmitExamResponse,
} from '@exameow/shared'

const CF_RELAY = 'https://exam.superagentparty.com'

const RELAY_BASE: string =
  (import.meta.env.VITE_EXAM_RELAY as string | undefined) ||
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window ? CF_RELAY : '')

export function examLinkFor(code: string): string {
  return `${RELAY_BASE}/#/take/${encodeURIComponent(code)}`
}

export function examMediaUrl(code: string, imageId: string): string {
  return `${RELAY_BASE}/api/exam/code/${encodeURIComponent(code)}/media/${encodeURIComponent(imageId)}`
}

export class RelayError extends Error {
  constructor(
    public status: number,
    public code: string,
    public startAt?: number,
  ) {
    super(code)
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RELAY_BASE}${path}`, init)
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new RelayError(
      res.status,
      typeof data.error === 'string' ? data.error : 'unknown',
      typeof data.startAt === 'number' ? data.startAt : undefined,
    )
  }
  return data as T
}

export function publishExam(req: PublishExamRequest): Promise<PublishExamResponse> {
  return request('/api/exam/publish', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export function fetchExam(code: string): Promise<PublishedExamInfo> {
  return request(`/api/exam/code/${encodeURIComponent(code)}`)
}

export function submitExam(code: string, req: SubmitExamRequest): Promise<SubmitExamResponse> {
  return request(`/api/exam/code/${encodeURIComponent(code)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
}

export function fetchResults(code: string, token: string): Promise<ExamResultsResponse> {
  return request(`/api/exam/code/${encodeURIComponent(code)}/results?token=${encodeURIComponent(token)}`)
}

export function deleteExam(code: string, token: string): Promise<{ ok: boolean }> {
  return request(`/api/exam/code/${encodeURIComponent(code)}?token=${encodeURIComponent(token)}`, {
    method: 'DELETE',
  })
}

export function reportExam(code: string, reason: string): Promise<{ ok: boolean }> {
  return request(`/api/exam/code/${encodeURIComponent(code)}/report`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reason }),
  })
}

export interface AdminReportRow {
  code: string
  title: string | null
  report_count: number
  ip_count: number
  last_reported_at: number
  last_reason: string | null
  suspended: number | null
}

async function adminRequest<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${RELAY_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...(init?.headers || {}) },
  })
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    throw new RelayError(
      res.status,
      typeof data.error === 'string' ? data.error : 'unknown',
      typeof data.startAt === 'number' ? data.startAt : undefined,
    )
  }
  return data as T
}

export function adminFetchReports(token: string): Promise<{ reports: AdminReportRow[]; need_change?: boolean }> {
  return adminRequest('/api/exam/admin/reports', token)
}

export function adminDeleteExam(token: string, code: string): Promise<{ ok: boolean }> {
  return adminRequest(`/api/exam/admin/code/${encodeURIComponent(code)}`, token, { method: 'DELETE' })
}

export function adminRestoreExam(token: string, code: string): Promise<{ ok: boolean }> {
  return adminRequest(`/api/exam/admin/code/${encodeURIComponent(code)}/restore`, token, { method: 'POST' })
}

export function adminChangeToken(token: string, newToken: string): Promise<{ ok: boolean }> {
  return adminRequest('/api/exam/admin/token', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_token: newToken }),
  })
}
