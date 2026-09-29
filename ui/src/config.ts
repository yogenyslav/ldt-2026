export const BASE_URL = import.meta.env.VITE_BASE_URL ?? '/api'

/* Demo mode is opt-in; otherwise requests go to dicom-manager. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

/* How often the technologist station polls for new scans.
   Will be replaced by a subscription once the backend exposes a push channel. */
export const POLL_INTERVAL = 3000

/* The centre queue is not watched by someone with a patient on the table, so it
   refreshes at a much calmer pace. */
export const QUEUE_POLL_INTERVAL = 15_000

/* Запуск дообучения пока доступен только в деморежиме; остальной интерфейс работает. */
export const TRAINING_LOCKED = !USE_MOCKS

/* Сохранение параметров пока доступно только в деморежиме; предпросмотр работает. */
export const SETTINGS_SAVE_LOCKED = !USE_MOCKS

/* How the markup queue tells the clinics' frames from the uploaded ones.
   Until the backend adds a parameter by the uploader's role, this rides on
   upload_source. When it arrives: put its name and values here, and (if the job
   DTO gets a matching field) the field name in sourceOf, lib/annotQueue.ts. */
export const SOURCE_PARAM = 'upload_source'
export const SOURCE_VALUE = { clinic: 'clinic', upload: 'manual' } as const
