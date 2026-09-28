import { api } from '@/lib/api'
import type { IRotationSettings } from '@/lib/settings'

/* The limits the analyser applies. They come back with every result in
   `metadata.settings`, so reading them needs no endpoint of its own; writing
   them does, and there is none yet — see context/backend_requests.md. */

const ApiSettings = {
  async save(settings: IRotationSettings) {
    return await api.post('/settings', settings)
  },
}

export default ApiSettings
