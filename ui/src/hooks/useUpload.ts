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
