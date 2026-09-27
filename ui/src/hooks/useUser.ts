import { useQuery } from '@tanstack/react-query'
import ApiUser from '@/services/apiUser'
import storage from '@/lib/storage'

export const useCurrentUser = () => {
  const saved = storage.getUser() as { user_id?: number } | null
  const userId = saved?.user_id

  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => ApiUser.getUser(userId as number).then((r) => r.data),
    enabled: !!userId,
  })
}
