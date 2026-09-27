import { api } from '@/lib/api'
import type { Decision, IJobInfo } from '@/types'

interface GetJobsData {
  limit: number
  offset: number
}

interface DecideData {
  jobIds: string[]
  decision: Decision
  comment?: string
}

const ApiJob = {
  async getJobs(data: GetJobsData) {
    return await api.get<{ jobs: IJobInfo[] }>(
      `/job/info?offset=${data.offset}&limit=${data.limit}`,
    )
  },

  async getJob(jobId: string) {
    return await api.get<{ job: IJobInfo }>(`/job/info/${jobId}`)
  },

  async decide(data: DecideData) {
    return await api.post('/job/result/decision', {
      job_ids: data.jobIds,
      decision: data.decision,
      comment: data.comment,
    })
  },
}

export default ApiJob
