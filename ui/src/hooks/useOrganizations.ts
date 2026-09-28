import { useQueries, useQuery } from '@tanstack/react-query'
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

export interface IOrganization {
  id: number
  name: string
}

/* GET /organization → { organizations: [{ id: string, name }] }. The id comes
   as a string; everywhere else (organization_ids, dicom info) it is a number. */
export const useOrganizations = () =>
  useQuery({
    queryKey: ['organizations'],
    queryFn: () =>
      api
        .get<{ organizations: { id: string | number; name: string }[] }>('/organization')
        .then((r): IOrganization[] =>
          (r.data.organizations ?? []).map((org) => ({ id: Number(org.id), name: org.name })),
        ),
    staleTime: 5 * 60_000,
    retry: false,
  })
