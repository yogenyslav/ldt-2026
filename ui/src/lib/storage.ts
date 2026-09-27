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

const storage = {
  getToken: (): string | null => read('token'),
  setToken: (token: string) =>
    window.localStorage.setItem(`${storagePrefix}token`, JSON.stringify(token)),

  getScope: (): 'post' | 'center' | null => read('scope'),
  setScope: (scope: string) =>
    window.localStorage.setItem(`${storagePrefix}scope`, JSON.stringify(scope)),

  getUser: () => read('user'),
  setUser: (user: unknown) =>
    window.localStorage.setItem(`${storagePrefix}user`, JSON.stringify(user)),

  clearAll: () => {
    for (const key of ['token', 'scope', 'user']) {
      window.localStorage.removeItem(`${storagePrefix}${key}`)
    }
  },
}

export default storage
