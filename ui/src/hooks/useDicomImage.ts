import { useQuery } from '@tanstack/react-query'
import ApiDicom, { toImageSrc } from '@/services/apiDicom'

export const useDicomImage = (dicomId?: string) => {
  const query = useQuery({
    queryKey: ['dicom', dicomId],
    queryFn: () => ApiDicom.getImage(dicomId as string).then((r) => r.data),
    enabled: !!dicomId,
    staleTime: Infinity,
  })

  return { ...query, src: toImageSrc(query.data) }
}
