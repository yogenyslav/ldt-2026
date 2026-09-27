import type { ISession, Scope } from '@/types'

const storagePrefix = 'dxa_qc_react_'

const read = (key: string) => {
  const raw = window.localStorage.getItem(`${storagePrefix}${key}`)
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

const write = (key: string, value: unknown) =>
  window.localStorage.setItem(`${storagePrefix}${key}`, JSON.stringify(value))

const storage = {
  getToken: (): string | null => read('token'),
  setToken: (token: string) => write('token', token),

  getScope: (): Scope | null => read('scope'),
  setScope: (scope: Scope) => write('scope', scope),

  getSession: (): ISession | null => read('session'),
  setSession: (session: ISession) => write('session', session),

  clearAll: () => {
    for (const key of ['token', 'scope', 'session']) {
      window.localStorage.removeItem(`${storagePrefix}${key}`)
    }
  },
}

export default storage
