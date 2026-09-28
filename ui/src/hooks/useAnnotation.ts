import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ApiAnnotation, { type SubmitData } from '@/services/apiAnnotation'

/* Nobody is standing over these screens with a patient on the table, so
   nothing here polls: the data is asked for once and refreshed when the
   annotator changes something. */

export const useAnnotQueue = () =>
  useQuery({
    queryKey: ['annot', 'queue'],
    queryFn: () => ApiAnnotation.getQueue().then((response) => response.data),
  })

export const useAnnotCase = (key?: string) =>
  useQuery({
    queryKey: ['annot', 'case', key],
    queryFn: () => ApiAnnotation.getCase(key as string).then((response) => response.data.case),
    enabled: !!key,
  })

export const useAddToQueue = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: { count: number; pre: boolean; urgent: boolean }) =>
      ApiAnnotation.addToQueue(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annot', 'queue'] }),
  })
}

/* The frame leaves the queue, so the queue behind the desk is asked again. */
export const useSubmitAnnot = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (data: SubmitData) => ApiAnnotation.submit(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annot', 'queue'] }),
  })
}

export const useTraining = () =>
  useQuery({
    queryKey: ['annot', 'training'],
    queryFn: () => ApiAnnotation.getTraining().then((response) => response.data),
  })

export const useStartTraining = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => ApiAnnotation.startTraining(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annot', 'training'] }),
  })
}

export const useSwitchVersions = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (ids: string[]) => ApiAnnotation.switchVersions(ids),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['annot', 'training'] }),
  })
}
