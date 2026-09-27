import axios from 'axios'
import storage from '@/lib/storage'
import { mockAdapter } from '@/lib/mockAdapter'
import { BASE_URL, USE_MOCKS } from '@/config'

export const api = axios.create({ baseURL: BASE_URL })

/* Демо-режим: транспорт подменяется, сами сервисы остаются настоящими. */
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
    if (error.response?.status === 401) {
      storage.clearAll()
      window.location.assign('/sign-in')
    }
    return Promise.reject(error)
  },
)
