export const BASE_URL = import.meta.env.VITE_BASE_URL ?? 'http://localhost:8000'

/* The dicom-manager handlers still return 501, so the UI runs on demo data
   by default. One line in .env switches it off. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false'

/* How often the technologist station polls for new scans.
   Will be replaced by a subscription once the backend exposes a push channel. */
export const POLL_INTERVAL = 3000
