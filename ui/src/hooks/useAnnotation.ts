import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ApiAnnotation, {
  type ISubmission,
  type ISubmissionRecord,
} from '@/services/apiAnnotation'
import { useJob, useJobs } from '@/hooks/useJobs'
import { annotTasks } from '@/lib/annotQueue'

/* ============================================================
   The annotation queue is not a list somebody keeps: it is the
   studies the service has already been through, narrowed to the ones
   worth a pair of eyes. So it is read from /job/info, the endpoint
   the whole centre already runs on.

   What is annotated does not disappear — it moves to the second
   list and can be corrected, which the contract calls a new
   submission superseding the old one.

   Sending and reading submissions needs endpoints, and there are
   none yet: those calls fail and the screen says so.
   ============================================================ */

export const useSubmissions = () =>
  useQuery({
    queryKey: ['annot', 'submissions'],
    queryFn: () => ApiAnnotation.listSubmissions().then((response) => response.data.submissions),
    retry: false,
  })

export const useAnnotQueue = () => {
  const jobs = useJobs(50)
  const submissions = useSubmissions()

  const all = useMemo(() => annotTasks(jobs.data), [jobs.data])

  /* One frame is one task, and the latest submission for it is what decides
     which of the two lists it belongs to. */
  const byKey = useMemo(() => {
    const map = new Map<string, ISubmissionRecord>()
    for (const item of submissions.data ?? []) map.set(item.task_id, item)
    return map
  }, [submissions.data])

  return {
    isLoading: jobs.isLoading,
    /* the list of submissions is optional: without it everything is unannotated,
       which is the truth before the endpoint exists */
    pending: all.filter((task) => !byKey.has(task.key)),
    done: all.filter((task) => byKey.has(task.key)),
    submissionOf: (key: string) => byKey.get(key),
    /* whether the second list could be read at all */
    submissionsFailed: submissions.isError,
  }
}

/* One frame of the queue: the study behind it, with the analysis it carries. */
export const useAnnotTask = (key?: string) => {
  const jobId = key?.split(':')[0]
  return useJob(jobId)
}

export const useSubmitAnnot = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (submission: ISubmission) => ApiAnnotation.submit(submission),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['annot', 'submissions'] })
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
    },
  })
}

export const useTraining = () =>
  useQuery({
    queryKey: ['annot', 'training'],
    queryFn: () => ApiAnnotation.getTraining().then((response) => response.data),
    retry: false,
  })

export const useStartTraining = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (models: string[]) => ApiAnnotation.startTraining(models),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annot', 'training'] }),
  })
}

export const useSwitchVersions = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (models: string[]) => ApiAnnotation.switchVersions(models),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annot', 'training'] }),
  })
}
