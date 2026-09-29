import type { Band, IJobInfo, Point } from '@/types'

/* ============================================================
   The boundaries the analyser actually applies.

   Rotation is not judged against four loose numbers: the analyser
   keeps three settings — the centre of the norm in millimetres, the
   tolerance around it, and how far past the tolerance a frame is
   merely doubtful. They arrive with every result in
   `metadata.settings` (qc_prototype), and the five stripes on the
   tuning screen are computed from them:

     нарушение · сомнение · норма · сомнение · нарушение

   With the settings as they ship — 2,7 мм, 63 %, 30 % — that comes
   out as 0,2 · 1,0 · 4,4 · 5,2, which is the norm quoted to the
   technologist on the station screen.

   So a handle on that screen moves a real setting, and it moves
   both sides at once, because that is how the analyser applies it.
   ============================================================ */

export interface IRotationSettings {
  trochanter_center_mm: number
  trochanter_tol_percent: number
  trochanter_yellow_percent: number
}

export const ROTATION_DEFAULTS: IRotationSettings = {
  trochanter_center_mm: 2.7,
  trochanter_tol_percent: 63,
  trochanter_yellow_percent: 30,
}

/* The scale the frames are shown on. The measurement is a distance in
   millimetres and never runs far past a centimetre. */
export const ROTATION_MIN = 0
export const ROTATION_MAX = 8
export const ROTATION_STEP = 0.1

export const ROTATION_BANDS: Band[] = ['viol', 'warn', 'norm', 'warn', 'viol']

const round1 = (value: number) => Number(value.toFixed(1))

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/* Are these the settings of the criterion this screen tunes? */
export function rotationSettings(value?: Record<string, number>): IRotationSettings | null {
  if (!value) return null
  const centre = value.trochanter_center_mm
  const tolerance = value.trochanter_tol_percent
  const doubt = value.trochanter_yellow_percent
  if ([centre, tolerance, doubt].some((item) => typeof item !== 'number')) return null
  return {
    trochanter_center_mm: centre,
    trochanter_tol_percent: tolerance,
    trochanter_yellow_percent: doubt,
  }
}

/* The settings the service is running right now, as the last result reports
   them. There is no endpoint for reading them on their own — see
   context/back_annotations.md. */
export function settingsOf(jobs?: IJobInfo[]): IRotationSettings | null {
  for (const job of jobs ?? []) {
    const found = rotationSettings(job.metadata?.settings)
    if (found) return found
  }
  return null
}

/* Four boundaries out of three settings. */
export function rotationCuts(settings: IRotationSettings): number[] {
  const centre = settings.trochanter_center_mm
  const tolerance = settings.trochanter_tol_percent / 100
  const doubt = settings.trochanter_yellow_percent / 100

  return [
    round1(centre * (1 - tolerance - doubt)),
    round1(centre * (1 - tolerance)),
    round1(centre * (1 + tolerance)),
    round1(centre * (1 + tolerance + doubt)),
  ]
}

/* Moving a handle back into the setting it came from. The two inner handles
   are the tolerance and the two outer ones the doubt band, so either of a
   pair moves both — the analyser has no one-sided limit. */
export function cutToSettings(
  settings: IRotationSettings,
  index: number,
  value: number,
): IRotationSettings {
  const centre = settings.trochanter_center_mm
  if (centre <= 0) return settings

  /* how far the handle now sits from the centre, as a share of it */
  const distance = index < 2 ? centre - value : value - centre
  const share = Math.max(0, distance / centre * 100)
  // Both mirrored boundaries must fit on the scale. Round down so the
  // stored percentage cannot push the opposite boundary past an endpoint.
  const maxShare = Math.floor(
    Math.min(centre - ROTATION_MIN, ROTATION_MAX - centre) / centre * 1000,
  ) / 10

  if (index === 1 || index === 2) {
    const tolerance = clamp(round1(share), 0, Math.max(0, maxShare - settings.trochanter_yellow_percent))
    /* the doubt band never ends up inside the tolerance */
    return { ...settings, trochanter_tol_percent: tolerance }
  }

  const doubt = clamp(round1(share - settings.trochanter_tol_percent), 0, Math.max(0, maxShare - settings.trochanter_tol_percent))
  return { ...settings, trochanter_yellow_percent: doubt }
}

/* The centre of the norm is a setting too, and the one that moves everything. */
export function centreToSettings(settings: IRotationSettings, value: number): IRotationSettings {
  const spread = (settings.trochanter_tol_percent + settings.trochanter_yellow_percent) / 100
  const maxCentre = Math.floor(ROTATION_MAX / (1 + spread) * 10) / 10
  return { ...settings, trochanter_center_mm: clamp(round1(value), ROTATION_STEP, maxCentre) }
}

/* Which of the three states a measured distance falls into. */
export function rotationBand(settings: IRotationSettings, value: number): Band {
  const cuts = rotationCuts(settings)
  for (let index = 0; index < cuts.length; index += 1) {
    if (value < cuts[index]) return ROTATION_BANDS[index]
  }
  return ROTATION_BANDS[ROTATION_BANDS.length - 1]
}

/* The norm as it is quoted to people, on this screen and on the station. */
export function normText(settings: IRotationSettings): string {
  const cuts = rotationCuts(settings)
  return `от ${cuts[1].toFixed(1).replace('.', ',')} до ${cuts[2].toFixed(1).replace('.', ',')} мм`
}

/* ---------- which models the service is running ----------
   Reported with every result in `metadata.models`: the name the contract uses
   and whether it is connected. There is no endpoint that lists them on their
   own, so the last result is the source — see context/back_annotations.md. */

export interface IModelState {
  id: string
  status: string
  connected: boolean
}

export function modelsOf(jobs?: IJobInfo[]): IModelState[] {
  for (const job of jobs ?? []) {
    const models = job.metadata?.models
    if (!models || !Object.keys(models).length) continue
    return Object.keys(models).map((id) => ({
      id,
      status: models[id],
      connected: models[id] === 'подключена',
    }))
  }
  return []
}

/* ---------- the frames the choice is made on ----------
   Real studies the service has already measured: the distance and the outline
   of the measured area come straight out of the result, the picture from
   GET /dicom/{id}/image. Nothing here is prepared for the screen. */

export interface IRotationFrame {
  jobId: string
  dicomId: string
  file: string
  cols: number
  rows: number
  value: number
  /* the outline of the measured area, in frame pixels */
  regions: Point[][]
}

export function rotationFrames(jobs?: IJobInfo[]): IRotationFrame[] {
  const frames: IRotationFrame[] = []

  for (const job of jobs ?? []) {
    const criterion = job.metadata?.criteria?.lesser_trochanter
    const shape = job.metadata?.shape
    if (!criterion || !shape) continue
    if (typeof criterion.value !== 'number' || !criterion.regions?.length) continue

    frames.push({
      jobId: job.id,
      dicomId: job.dicom_id,
      file: job.file_name ?? job.id,
      rows: shape[0],
      cols: shape[1],
      value: criterion.value,
      regions: criterion.regions,
    })
  }

  return frames
}

export function sameSettings(a: IRotationSettings, b: IRotationSettings): boolean {
  return (
    a.trochanter_center_mm === b.trochanter_center_mm &&
    a.trochanter_tol_percent === b.trochanter_tol_percent &&
    a.trochanter_yellow_percent === b.trochanter_yellow_percent
  )
}
