import { useMutation, useQueryClient } from '@tanstack/react-query'
import ApiDicom from '@/services/apiDicom'

/* Upload is the one place where the interface changes the queue, so both hooks
   invalidate it: the new job has to show up without a page reload. */

export const useUploadScan = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => ApiDicom.upload(file).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export const useUploadArchive = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (file: File) => ApiDicom.uploadBatch(file).then((r) => r.data.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

/* One file, whichever kind it is: the annotation queue takes both a single
   scan and an archive, and only cares which jobs came out of it. */
export const useUpload = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (file: File) => {
      const archive = /\.zip$/i.test(file.name)
      if (archive) {
        const created = await ApiDicom.uploadBatch(file).then((r) => r.data.data)
        return created.map((item) => item.job_id)
      }
      const created = await ApiDicom.upload(file).then((r) => r.data)
      return [created.job_id]
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jobs'] }),
  })
}
