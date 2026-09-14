let identityVersion = 0
export const invalidateRequests = () => { identityVersion++ }
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const started = identityVersion
  let response: Response
  try {
    response = await fetch(path, { ...init, credentials: 'same-origin', headers: { 'content-type': 'application/json', ...init.headers } })
  } catch { throw new Error('无法连接丸丸服务，请检查网络后重试') }
  const data = await response.json().catch(() => null)
  if (started !== identityVersion) throw new Error('账号已切换，请重新操作')
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event('wanwan-session-expired'))
    throw new Error(data?.message || data?.friendlyMessage || '服务暂时不可用，请稍后重试')
  }
  return data as T
}
export function post<T>(path: string, value: unknown): Promise<T> {
  return request<T>(path, { method: 'POST', body: JSON.stringify(value) })
}
