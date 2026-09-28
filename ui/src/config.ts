export const BASE_URL = import.meta.env.VITE_BASE_URL ?? '/api'

/* Demo mode is opt-in; otherwise requests go to dicom-manager. */
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS === 'true'

/* How often the technologist station polls for new scans.
   Will be replaced by a subscription once the backend exposes a push channel. */
export const POLL_INTERVAL = 3000

/* The centre queue is not watched by someone with a patient on the table, so it
   refreshes at a much calmer pace. */
export const QUEUE_POLL_INTERVAL = 15_000

/* The test stand must not retrain or replace models: it would knock the
   calibration off. Only the demo mode (no backend) may pretend to do it. */
export const TRAINING_LOCKED = !USE_MOCKS
