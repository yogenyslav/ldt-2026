import type { AxiosAdapter, AxiosResponse, InternalAxiosRequestConfig } from 'axios'
import { DEMO_JOBS, DEMO_SCANS } from '@/services/mock/demoJobs'
import type { Decision, IJobInfo, IReport } from '@/types'

/* Demo mode. The adapter replaces the axios transport, so the services in
   services/apiXxx.ts stay real: with VITE_USE_MOCKS=false the very same
   methods hit dicom-manager without a single edit.

   Needed while the backend handlers return 501. */

const store = {
  jobs: DEMO_JOBS.map((job) => ({ ...job })) as IJobInfo[],
  reports: [
    { id: 41, created_at: '2026-09-26T17:02:11', download_url: 'reports/report-41.csv' },
    { id: 40, created_at: '2026-09-25T18:40:55', download_url: 'reports/report-40.csv' },
  ] as IReport[],
}

const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms))

/* A real endpoint returns fresh JSON every time. Return a copy, otherwise
   react-query gets the references it already holds and misses the change. */
const clone = <T,>(value: T): T => structuredClone(value)

function reply<T>(config: InternalAxiosRequestConfig, data: T, status = 200): AxiosResponse<T> {
  return {
    data,
    status,
    statusText: 'OK',
    headers: {},
    config,
  }
}

function fail(config: InternalAxiosRequestConfig, status: number, message: string) {
  const error = new Error(message) as Error & { response?: AxiosResponse }
  error.response = reply(config, message, status)
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

export const mockAdapter: AxiosAdapter = async (config) => {
  const method = (config.method ?? 'get').toLowerCase()
  const url = (config.url ?? '').split('?')[0]
  const query = new URLSearchParams((config.url ?? '').split('?')[1] ?? '')
  await delay()

  /* --- sign-in --- */
  if (method === 'post' && url === '/user/login') {
    const { username } = body(config) as { username?: string }
    const isLaborant = (username ?? '').toLowerCase().startsWith('ivanova')
    return reply(config, {
      token: 'demo-token',
      user_id: isLaborant ? 42 : 17,
      org_id: isLaborant ? 218 : 1,
      role: isLaborant ? 'specialist' : 'admin',
      scope: isLaborant ? 'post' : 'center',
    })
  }

  if (method === 'get' && url.startsWith('/user/')) {
    const id = Number(url.split('/')[2])
    return reply(config, id === 42
      ? { id, full_name: 'Иванова А. П.', role: 'specialist', organisation_ids: [218] }
      : { id, full_name: 'Соколова М. И.', role: 'admin', organisation_ids: [1] })
  }

  /* --- jobs --- */
  if (method === 'get' && url === '/job/info') {
    const offset = Number(query.get('offset') ?? 0)
    const limit = Number(query.get('limit') ?? 10)
    const sorted = [...store.jobs].sort((a, b) => b.created_at.localeCompare(a.created_at))
    return reply(config, { jobs: clone(sorted.slice(offset, offset + limit)) })
  }

  if (method === 'get' && url.startsWith('/job/info/')) {
    const id = url.split('/')[3]
    const job = store.jobs.find((item) => item.id === id)
    if (!job) return fail(config, 404, 'Задача не найдена')
    return reply(config, { job: clone(job) })
  }

  if (method === 'post' && url === '/job/result/decision') {
    const { job_ids: jobIds, decision, comment } = body(config) as {
      job_ids: string[]
      decision: Decision
      comment?: string
    }
    for (const job of store.jobs) {
      if (!jobIds.includes(job.id)) continue
      job.specialist_decision = decision
      job.comment = comment ?? ''
      job.specialist_name = 'Соколова М. И.'
    }
    return reply(config, '', 204)
  }

  /* --- scan --- */
  if (method === 'get' && /^\/dicom\/[^/]+\/image$/.test(url)) {
    const dicomId = url.split('/')[2]
    const src = DEMO_SCANS[dicomId]
    if (!src) return fail(config, 404, 'Снимок не найден')
    /* the real system sends base64 here; the demo sends a file path,
       both are handled in services/apiDicom.ts */
    return reply(config, { image_data: src })
  }

  /* --- upload --- */
  if (method === 'post' && url === '/dicom/upload/batch') {
    const source = store.jobs.filter((job) => job.status === 'completed').slice(0, 8)
    return reply(config, {
      data: source.map((job) => ({ dicom_id: job.dicom_id, job_id: job.id })),
    }, 201)
  }

  if (method === 'post' && url === '/dicom/upload') {
    const job = store.jobs[0]
    return reply(config, { dicom_id: job.dicom_id, job_id: job.id }, 201)
  }

  /* --- reports --- */
  if (method === 'get' && url === '/report') {
    return reply(config, { reports: clone(store.reports) })
  }

  if (method === 'get' && url.startsWith('/report/')) {
    const id = Number(url.split('/')[2])
    const report = store.reports.find((item) => item.id === id)
    if (!report) return fail(config, 404, 'Отчёт не найден')
    return reply(config, { report: clone(report) })
  }

  if (method === 'post' && url === '/report/generate') {
    const id = (store.reports[0]?.id ?? 0) + 1
    const report = {
      id,
      created_at: new Date().toISOString().slice(0, 19),
      download_url: `reports/report-${id}.csv`,
    }
    store.reports = [report, ...store.reports]
    return reply(config, { report_id: id })
  }

  return fail(config, 404, `Демо-режим: ручка ${method.toUpperCase()} ${url} не описана`)
}
