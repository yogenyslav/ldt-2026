import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ApiSettings from '@/services/apiSettings'
import type { IRotationSettings } from '@/lib/settings'

export const useSettings = () => useQuery({
  queryKey: ['settings'],
  queryFn: () => ApiSettings.get().then((response) => response.data),
})

/* Готовые результаты сохраняют параметры, с которыми выполнялся анализ. */
export const useSaveSettings = () => {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (settings: IRotationSettings) => ApiSettings.save(settings),
    onSuccess: (response) => {
      queryClient.setQueryData(['settings'], response.data)
    },
  })
}
