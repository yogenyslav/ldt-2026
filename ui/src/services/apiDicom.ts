import { api } from '@/lib/api'
import type { IDicomImage, IUploadedDicom } from '@/types'

const ApiDicom = {
  async getImage(dicomId: string) {
    return await api.get<IDicomImage>(`/dicom/${dicomId}/image`)
  },

  async upload(file: File) {
    const formData = new FormData()
    formData.append('file', file)
    return await api.post<IUploadedDicom>('/dicom/upload', formData)
  },

  async uploadBatch(file: File) {
    const formData = new FormData()
    formData.append('files', file)
    return await api.post<{ data: IUploadedDicom[] }>('/dicom/upload/batch', formData)
  },
}

export default ApiDicom

/* Ручка отдаёт base64, а в демо-режиме — путь к файлу.
   Приводим оба варианта к тому, что понимает <img src>. */
export function toImageSrc(image?: IDicomImage) {
  const data = image?.image_data
  if (!data) return ''
  if (data.startsWith('data:') || data.startsWith('/') || data.startsWith('http')) return data
  return `data:image/png;base64,${data}`
}
