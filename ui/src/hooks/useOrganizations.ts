import { useQueries } from '@tanstack/react-query'
import { api } from '@/lib/api'

/* id → name for the organisations that occur in the loaded jobs.
   GET /organization/{org_id} returns { id, name }. */
export const useOrgNames = (ids: number[]) => {
  const results = useQueries({
    queries: ids.map((id) => ({
      queryKey: ['organization', id],
      queryFn: () => api.get<{ id: number; name: string }>(`/organization/${id}`).then((r) => r.data.name),
      staleTime: Infinity,
    })),
  })

  const names: Record<number, string> = {}
  ids.forEach((id, index) => {
    const name = results[index]?.data
    if (name) names[id] = name
  })
  return names
}
