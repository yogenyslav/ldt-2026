import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ApiJob from '@/services/apiJob'
import { groupByStudy } from '@/lib/verdict'
import { POLL_INTERVAL } from '@/config'
import type { Decision } from '@/types'

export const useJobs = (limit = 50, offset = 0) =>
  useQuery({
    queryKey: ['jobs', limit, offset],
    queryFn: () => ApiJob.getJobs({ limit, offset }).then((r) => r.data.jobs),
  })

/* Очередь центра: список посещений вместо плоского списка снимков. */
export const useStudies = (limit = 50, offset = 0) => {
  const query = useJobs(limit, offset)
  return { ...query, studies: query.data ? groupByStudy(query.data) : [] }
}

/* Пост лаборанта: экран сам обновляется, пока открыт.
   Заменится подпиской, когда у бекенда появится push-канал. */
export const useLatestJobs = (enabled = true) =>
  useQuery({
    queryKey: ['jobs', 'latest'],
    queryFn: () => ApiJob.getJobs({ limit: 20, offset: 0 }).then((r) => r.data.jobs),
    refetchInterval: POLL_INTERVAL,
    enabled,
  })

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
