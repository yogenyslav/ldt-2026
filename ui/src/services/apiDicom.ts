import { api } from '@/lib/api'
import type { IDicomImage, IDicomInfo, IUploadedDicom } from '@/types'

const ApiDicom = {
  /* File card: patient, device, file name, study and the organisation. */
  async getInfo(dicomId: string) {
    return await api.get<IDicomInfo>(`/dicom/${dicomId}`)
  },

  async getImage(dicomId: string) {
    return await api.get<IDicomImage>(`/dicom/${dicomId}/image`)
  },

  async upload(file: File) {
    return await api.post<IUploadedDicom>('/dicom/upload', file, {
      headers: {
        'Content-Type': 'application/dicom',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      },
    })
  },

  async uploadBatch(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return await api.post<{ data: IUploadedDicom[] }>('/dicom/upload/batch', formData)
  },
}

export default ApiDicom

/* The endpoint returns base64, the demo mode returns a file path.
   Normalise both into something <img src> understands. */
export function toImageSrc(image?: IDicomImage) {
  const data = image?.image_data
  if (!data) return ''
  if (data.startsWith('data:') || data.startsWith('/') || data.startsWith('http')) return data
  return `data:image/png;base64,${data}`
}
