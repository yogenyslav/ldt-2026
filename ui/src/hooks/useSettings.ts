import { useMutation, useQueryClient } from '@tanstack/react-query'
import ApiSettings from '@/services/apiSettings'
import type { IRotationSettings } from '@/lib/settings'

/* Saving new limits changes how every result reads, so the queue is asked
   again: the verdicts on it are computed from these numbers. */
export const useSaveSettings = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (settings: IRotationSettings) => ApiSettings.save(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['jobs'] })
      queryClient.invalidateQueries({ queryKey: ['job'] })
    },
  })
}
