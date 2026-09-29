import { useQueries, useQuery } from '@tanstack/react-query'
import ApiDicom from '@/services/apiDicom'
import { enrichJob } from '@/lib/dicom'
import type { IJobInfo } from '@/types'

const options = (dicomId?: string) => ({
  queryKey: ['dicom-info', dicomId],
  queryFn: () => ApiDicom.getInfo(dicomId as string).then((r) => r.data),
  enabled: !!dicomId,
  staleTime: Infinity,
  retry: false,
})

export const useDicomInfo = (dicomId?: string) => useQuery(options(dicomId))

/* Карточки снимков по dicom_id используют общий кеш с useDicomInfo. */
export const useDicomInfos = (dicomIds: string[]) => {
  const results = useQueries({ queries: dicomIds.map((id) => options(id)) })
  return Object.fromEntries(dicomIds.map((id, index) => [id, results[index]?.data]))
}

/* Дополняем задачи данными пациента и исследования из карточек DICOM. */
export const useEnrichedJobs = (jobs?: IJobInfo[]) => {
  const ids = [...new Set((jobs ?? []).map((job) => job.dicom_id))]
  const dicoms = useDicomInfos(ids)
  const enriched = jobs?.map((job) => enrichJob(job, dicoms[job.dicom_id]))
  return { jobs: enriched, dicoms }
}
