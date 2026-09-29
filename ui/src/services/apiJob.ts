import { api } from '@/lib/api'
import { SOURCE_PARAM } from '@/config'
import type { Decision, IJobInfo, UploadSource } from '@/types'

/* Server-side filters of GET /job/info. Without organizationIds an admin gets
   the jobs of their own organisation only. */
export interface IJobFilter {
  organizationIds?: number[]
  uploadSource?: UploadSource[]
}

interface GetJobsData extends IJobFilter {
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
    const params = new URLSearchParams({ offset: String(data.offset), limit: String(data.limit) })
    if (data.organizationIds?.length) params.set('organization_ids', data.organizationIds.join(','))
    if (data.uploadSource?.length) params.set(SOURCE_PARAM, data.uploadSource.join(','))
    return await api.get<{ jobs: IJobInfo[] }>(`/job/info?${params.toString().replace(/%2C/g, ',')}`)
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
