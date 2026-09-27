import { useQuery } from '@tanstack/react-query'
import ApiUser from '@/services/apiUser'
import storage from '@/lib/storage'

export const useCurrentUser = () => {
  const userId = storage.getSession()?.user_id

  return useQuery({
    queryKey: ['user', userId],
    queryFn: () => ApiUser.getUser(userId as number).then((r) => r.data),
    enabled: !!userId,
    staleTime: Infinity,
  })
}

/* The organisation the specialist works in. Only the id arrives from the
   backend: the organisation table has a name, but no endpoint exposes it. */
export const useOrgId = () => storage.getSession()?.org_id
