import { api } from '@/lib/api'
import type { IReport } from '@/types'

interface GetReportsData {
  limit: number
  offset: number
}

const ApiReport = {
  async getReports(data: GetReportsData) {
    return await api.get<{ reports: IReport[] }>(
      `/report?offset=${data.offset}&limit=${data.limit}`,
    )
  },

  async getReport(reportId: number) {
    return await api.get<{ report: IReport }>(`/report/${reportId}`)
  },

  async generate(jobIds: string[]) {
    return await api.post<{ report_id: number }>('/report/generate', { job_ids: jobIds })
  },
}

export default ApiReport
