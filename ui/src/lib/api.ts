import axios from 'axios'
import storage from '@/lib/storage'
import { mockAdapter } from '@/lib/mockAdapter'
import { BASE_URL, USE_MOCKS } from '@/config'

export const api = axios.create({ baseURL: BASE_URL })

/* Demo mode swaps the transport only; the services themselves stay real. */
if (USE_MOCKS) {
  api.defaults.adapter = mockAdapter
}

api.interceptors.request.use((config) => {
  const token = storage.getToken()
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    /* An expired token throws the specialist back to the sign-in screen. A wrong
       password must not: the sign-in screen is already open and shows the error
       itself, a reload would only wipe what was typed. */
    const onSignIn = String(error.config?.url ?? '').includes('/user/login')
    if (error.response?.status === 401 && !onSignIn) {
      storage.clearAll()
      window.location.assign('/sign-in')
    }
    return Promise.reject(error)
  },
)
