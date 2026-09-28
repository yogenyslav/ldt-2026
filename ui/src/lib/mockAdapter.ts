import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { DEMO_SCANS } from '@/services/mock/demoJobs'
import { csvDataUrl, reportCsv } from '@/services/mock/csv'
import annotStore from '@/services/mock/annotStore'
import store from '@/services/mock/store'
import { rotationSettings } from '@/lib/settings'
import { zipEntries } from '@/services/mock/zip'
import type { Decision } from '@/types'

/* Demo mode. The adapter replaces the axios transport, so the services in
   services/apiXxx.ts stay real: with VITE_USE_MOCKS=false the very same methods
   hit dicom-manager without a single edit.

   This file handles routing and request parsing; the state lives in services/mock/store.ts. */

/* Two accounts, one per contour. The password is checked like a real service
   would check it: a wrong one answers 401 and the sign-in screen says so. */
const ACCOUNTS = [
  {
    email: 'ivanova.a.p@example.com',
    password: 'laborant2026',
    user_id: 42,
    organization_id: 218,
    full_name: 'Иванова А. П.',
    role: 'specialist' as const,
  },
  {
    email: 'sokolova.m.i@example.com',
    password: 'centr2026',
    user_id: 17,
    organization_id: 1,
    full_name: 'Соколова М. И.',
    role: 'admin' as const,
  },
]

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))

function reply<T>(config: InternalAxiosRequestConfig, data: T, status = 200): AxiosResponse<T> {
  return { data, status, statusText: 'OK', headers: {}, config }
}

function fail(config: InternalAxiosRequestConfig, status: number, message: string) {
  const error = new Error(message) as Error & { response?: AxiosResponse }
  error.response = reply(config, { message }, status)
  Object.assign(error, { config })
  return Promise.reject(error)
}

const body = (config: InternalAxiosRequestConfig) => {
  if (!config.data) return {}
  if (typeof config.data === 'string') {
    try {
      return JSON.parse(config.data)
    } catch {
      return {}
    }
  }
  return config.data as Record<string, unknown>
}

const fileOf = (config: InternalAxiosRequestConfig, field: string) => {
  const data = config.data
  if (!(data instanceof FormData)) return null
  const value = data.get(field)
  return value instanceof File ? value : null
}

/* The real service reads sub out of the JWT; the demo token carries the same
   thing, so the mock knows who is asking. */
const callerOf = (config: InternalAxiosRequestConfig) => {
  const header = String(config.headers?.Authorization ?? '')
  const id = Number(header.split('demo-token-')[1])
  return ACCOUNTS.find((account) => account.user_id === id)
}

export const mockAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toLowerCase()
  const url = (config.url ?? '').split('?')[0]
  const query = new URLSearchParams((config.url ?? '').split('?')[1] ?? '')
  await delay()

  /* --- sign-in --- */
  if (method === 'post' && url === '/user/login') {
    const { email, password } = body(config) as { email?: string; password?: string }
    const account = ACCOUNTS.find(
      (item) =>
        item.email === (email ?? '').trim().toLowerCase() && item.password === password,
    )
    if (!account) return fail(config, 401, 'Неверный логин или пароль')
    return reply(config, {
      token: `demo-token-${account.user_id}`,
      role: account.role,
      user_id: account.user_id,
      organization_id: account.organization_id,
    })
  }

  if (method === 'get' && /^\/user\/\d+$/.test(url)) {
    const id = Number(url.split('/')[2])
    const account = ACCOUNTS.find((item) => item.user_id === id)
    if (!account) return fail(config, 404, 'Пользователь не найден')
    return reply(config, {
      id: account.user_id,
      full_name: account.full_name,
      role: account.role,
      organization_id: account.organization_id,
    })
  }

  /* --- jobs --- */
  if (method === 'get' && url === '/job/info') {
    const offset = Number(query.get('offset') ?? 0)
    const limit = Number(query.get('limit') ?? 10)
    return reply(config, { jobs: store.jobs().slice(offset, offset + limit) })
  }

  if (method === 'get' && url.startsWith('/job/info/')) {
    const job = store.job(url.split('/')[3])
    if (!job) return fail(config, 404, 'Задача не найдена')
    return reply(config, { job })
  }

  if (method === 'post' && url === '/job/result/decision') {
    const { job_ids: jobIds, decision, comment } = body(config) as {
      job_ids: string[]
      decision: Decision
      comment?: string
    }
    store.decide(jobIds, decision, comment ?? '', callerOf(config)?.full_name ?? '')
    return reply(config, '', 204)
  }

  /* --- scan --- */
  if (method === 'get' && /^\/dicom\/[^/]+\/image$/.test(url)) {
    const src = DEMO_SCANS[url.split('/')[2]]
    if (!src) return fail(config, 404, 'Снимок не найден')
    /* the real system sends base64 here, the demo sends a file path;
       both are handled in services/apiDicom.ts */
    return reply(config, { image_data: src })
  }

  /* --- upload --- */
  if (method === 'post' && url === '/dicom/upload') {
    const file = config.data instanceof File ? config.data : null
    if (!file || config.headers['Content-Type'] !== 'application/dicom') {
      return fail(config, 400, 'Ожидается DICOM-файл с Content-Type application/dicom')
    }
    return reply(config, store.create(file.name), 201)
  }

  if (method === 'post' && url === '/dicom/upload/batch') {
    const file = fileOf(config, 'file')
    if (!file) return fail(config, 400, 'Архив не передан')

    const names = zipEntries(await file.arrayBuffer())
    if (!names.length) return fail(config, 400, 'В архиве нет файлов')

    return reply(config, { data: names.map((name) => store.create(name)) }, 201)
  }

  /* --- reports --- */
  if (method === 'get' && url === '/report') {
    const offset = Number(query.get('offset') ?? 0)
    const limit = Number(query.get('limit') ?? 10)
    return reply(config, { reports: store.reports().slice(offset, offset + limit) })
  }

  if (method === 'get' && /^\/report\/\d+$/.test(url)) {
    const report = store.report(Number(url.split('/')[2]))
    if (!report) return fail(config, 404, 'Отчёт не найден')
    return reply(config, { report })
  }

  if (method === 'post' && url === '/report/generate') {
    const { job_ids: jobIds } = body(config) as { job_ids: string[] }
    const jobs = jobIds.map((id) => store.job(id)).filter((job) => !!job)
    if (!jobs.length) return fail(config, 400, 'Не выбрано ни одной задачи')
    return reply(config, { report_id: store.addReport(csvDataUrl(reportCsv(jobs))) })
  }

  /* --- limits the analyser applies --- */
  if (method === 'post' && url === '/settings') {
    const settings = rotationSettings(body(config) as Record<string, number>)
    if (!settings) return fail(config, 400, 'Границы переданы не полностью')
    store.setSettings(settings)
    return reply(config, '', 204)
  }

  /* --- annotation: queue, desk, training, boundaries --- */
  if (method === 'get' && url === '/annotation/queue') {
    return reply(config, { queue: annotStore.queue() })
  }

  if (method === 'post' && url === '/annotation/queue') {
    const { count, pre } = body(config) as { count?: number; pre?: boolean }
    return reply(config, annotStore.add(Number(count) || 1, pre !== false), 201)
  }

  if (method === 'get' && url.startsWith('/annotation/case/')) {
    const item = annotStore.case(url.split('/')[3])
    if (!item) return fail(config, 404, 'Снимок не найден')
    return reply(config, { case: item })
  }

  if (method === 'post' && url === '/annotation/submit') {
    const { key } = body(config) as { key?: string }
    if (!key || !annotStore.case(key)) return fail(config, 400, 'Снимок не передан')
    annotStore.finish(key)
    return reply(config, '', 204)
  }

  if (method === 'get' && url === '/annotation/training') {
    return reply(config, { targets: annotStore.targets(), versions: annotStore.versions() })
  }

  if (method === 'post' && url === '/annotation/training/start') {
    const { ids } = body(config) as { ids?: string[] }
    annotStore.train(ids ?? [])
    return reply(config, '', 204)
  }

  if (method === 'post' && url === '/annotation/training/switch') {
    const { ids } = body(config) as { ids?: string[] }
    annotStore.switchOver(ids ?? [])
    return reply(config, '', 204)
  }

  return fail(config, 404, `Демо-режим: ручка ${method.toUpperCase()} ${url} не описана`)
}
