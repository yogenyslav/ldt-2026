import { useQueries, useQuery } from '@tanstack/react-query'
import ApiDicom from '@/services/apiDicom'
import type { IJobInfo } from '@/types'

const options = (dicomId?: string) => ({
  queryKey: ['dicom-info', dicomId],
  queryFn: () => ApiDicom.getInfo(dicomId as string).then((r) => r.data),
  enabled: !!dicomId,
  staleTime: Infinity,
  retry: false,
})

export const useDicomInfo = (dicomId?: string) => useQuery(options(dicomId))

/* dicom_id → file card for a list of scans; the same cache as useDicomInfo. */
export const useDicomInfos = (dicomIds: string[]) => {
  const results = useQueries({ queries: dicomIds.map((id) => options(id)) })
  return Object.fromEntries(dicomIds.map((id, index) => [id, results[index]?.data]))
}

/* The job DTO carries no visit or patient: they live in the file card. Lay them
   over the jobs so that grouping and the screens read them from one place. */
export const useEnrichedJobs = (jobs?: IJobInfo[]) => {
  const ids = [...new Set((jobs ?? []).map((job) => job.dicom_id))]
  const dicoms = useDicomInfos(ids)
  const enriched = jobs?.map((job) => {
    const dicom = dicoms[job.dicom_id]
    if (!dicom) return job
    return {
      ...job,
      study_id: dicom.study_id || job.study_id,
      patient_ref: dicom.patient_id || job.patient_ref,
      file_name: dicom.file_name || job.file_name,
    }
  })
  return { jobs: enriched, dicoms }
}
