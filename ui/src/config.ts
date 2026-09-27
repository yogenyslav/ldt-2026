export const BASE_URL = import.meta.env.VITE_BASE_URL ?? 'http://localhost:8000'

/* Хендлеры dicom-manager пока возвращают 501, поэтому по умолчанию
   интерфейс работает на демо-данных. Выключается в .env одной строкой. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

/* Как часто пост лаборанта спрашивает новые снимки.
   Заменится подпиской, когда у бекенда появится push-канал. */
export const POLL_INTERVAL = 3000
