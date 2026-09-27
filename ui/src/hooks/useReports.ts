import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import ApiReport from '@/services/apiReport'

export const useReports = (limit = 20, offset = 0) =>
  useQuery({
    queryKey: ['reports', limit, offset],
    queryFn: () => ApiReport.getReports({ limit, offset }).then((r) => r.data.reports),
  })

export const useGenerateReport = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (jobIds: string[]) => ApiReport.generate(jobIds).then((r) => r.data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reports'] }),
  })
}
