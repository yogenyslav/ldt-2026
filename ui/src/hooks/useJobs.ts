import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ApiJob from '@/services/apiJob'
import { groupByStudy } from '@/lib/verdict'
import { POLL_INTERVAL, QUEUE_POLL_INTERVAL } from '@/config'
import type { IJobFilter } from '@/services/apiJob'
import type { Intake } from '@/lib/cabinet'
import type { Decision, UploadSource } from '@/types'

/* refetchInterval is per observer, and react-query takes the shortest one of
   them: a screen that watches a batch being processed asks for a faster pace
   than the queue behind it. */
export const useJobs = (
  limit = 50,
  offset = 0,
  refetchInterval = QUEUE_POLL_INTERVAL,
  filter: IJobFilter = {},
) =>
  useQuery({
    queryKey: ['jobs', limit, offset, filter],
    queryFn: () => ApiJob.getJobs({ limit, offset, ...filter }).then((r) => r.data.jobs),
    refetchInterval,
  })

/* Centre queue: a list of visits instead of a flat list of scans. */
export const useStudies = (limit = 50, offset = 0) => {
  const query = useJobs(limit, offset)
  return { ...query, studies: query.data ? groupByStudy(query.data) : [] }
}

/* Technologist station. In the device mode the screen refreshes itself while it
   is open — that polling is the whole mechanism by which a scan "arrives on its
   own", and it will be replaced by a subscription once the backend exposes a push
   channel. In the manual mode there is nothing to wait for, so the station asks
   once and then only while a scan of its own is being processed. */
export const useLatestJobs = (poll = true, intake: Intake = 'device') => {
  /* the mode decides which source is worth asking about, on the server side */
  const uploadSource: UploadSource[] = [intake === 'device' ? 'orthanc' : 'manual']
  return useQuery({
    queryKey: ['jobs', 'latest', uploadSource],
    queryFn: () => ApiJob.getJobs({ limit: 20, offset: 0, uploadSource }).then((r) => r.data.jobs),
    refetchInterval: poll ? POLL_INTERVAL : false,
  })
}

export const useJob = (jobId?: string) =>
  useQuery({
    queryKey: ['job', jobId],
    queryFn: () => ApiJob.getJob(jobId as string).then((r) => r.data.job),
    enabled: !!jobId,
  })

export const useDecideJob = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { jobIds: string[]; decision: Decision; comment?: string }) =>
      ApiJob.decide(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['job'] })
    },
  })
}
