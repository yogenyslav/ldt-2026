import type { Band, IJobInfo, Point } from '@/types'

/* Параметры ротации: центр нормы, допуск и ширина полосы сомнения.
   Из них вычисляются четыре симметричные границы пяти зон:
   нарушение · сомнение · норма · сомнение · нарушение.
   При значениях 2,7 мм, 63% и 30% границы равны 0,2 · 1,0 · 4,4 · 5,2 мм. */

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

/* Диапазон шкалы настройки расстояния в миллиметрах. */
export const ROTATION_MIN = 0
export const ROTATION_MAX = 8
export const ROTATION_STEP = 0.1

export const ROTATION_BANDS: Band[] = ['viol', 'warn', 'norm', 'warn', 'viol']

const round1 = (value: number) => Number(value.toFixed(1))

const clamp = (value: number, low: number, high: number) => Math.min(Math.max(value, low), high)

/* Извлекаем параметры критерия ротации из метаданных результата. */
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

/* Параметры готовых результатов; текущие настройки читаются через GET /settings. */
export function settingsOf(jobs?: IJobInfo[]): IRotationSettings | null {
  for (const job of jobs ?? []) {
    const found = rotationSettings(job.metadata?.settings)
    if (found) return found
  }
  return null
}

/* Вычисляем четыре границы по трем параметрам. */
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

/* Внутренние бегунки задают допуск, внешние — полосу сомнения.
   Перемещение одного бегунка изменяет обе симметричные границы. */
export function cutToSettings(
  settings: IRotationSettings,
  index: number,
  value: number,
): IRotationSettings {
  const centre = settings.trochanter_center_mm
  if (centre <= 0) return settings

  /* Расстояние от бегунка до центра как доля значения центра. */
  const distance = index < 2 ? centre - value : value - centre
  const share = Math.max(0, distance / centre * 100)

  // Обе симметричные границы должны оставаться на шкале. Округляем вниз,
  // чтобы сохраненный процент не вывел парную границу за край.
  const maxShare = Math.floor(
    Math.min(centre - ROTATION_MIN, ROTATION_MAX - centre) / centre * 1000,
  ) / 10

  if (index === 1 || index === 2) {
    const tolerance = clamp(round1(share), 0, Math.max(0, maxShare - settings.trochanter_yellow_percent))
    /* Полоса сомнения не заходит внутрь допуска. */
    return { ...settings, trochanter_tol_percent: tolerance }
  }

  const doubt = clamp(round1(share - settings.trochanter_tol_percent), 0, Math.max(0, maxShare - settings.trochanter_tol_percent))
  return { ...settings, trochanter_yellow_percent: doubt }
}

/* Перемещение центра сдвигает все границы. */
export function centreToSettings(settings: IRotationSettings, value: number): IRotationSettings {
  const spread = (settings.trochanter_tol_percent + settings.trochanter_yellow_percent) / 100
  const maxCentre = Math.floor(ROTATION_MAX / (1 + spread) * 10) / 10
  return { ...settings, trochanter_center_mm: clamp(round1(value), ROTATION_STEP, maxCentre) }
}

/* Определяем состояние снимка по измеренному расстоянию. */
export function rotationBand(settings: IRotationSettings, value: number): Band {
  const cuts = rotationCuts(settings)
  for (let index = 0; index < cuts.length; index += 1) {
    if (value < cuts[index]) return ROTATION_BANDS[index]
  }
  return ROTATION_BANDS[ROTATION_BANDS.length - 1]
}

/* Текст диапазона нормы для интерфейса. */
export function normText(settings: IRotationSettings): string {
  const cuts = rotationCuts(settings)
  return `от ${cuts[1].toFixed(1).replace('.', ',')} до ${cuts[2].toFixed(1).replace('.', ',')} мм`
}

/* Состояние моделей берем из metadata.models последнего результата:
   отдельного запроса для списка моделей пока нет. */

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

/* Примеры из обработанных исследований: расстояние и контур из результата,
   изображение — из GET /dicom/{id}/image. */

export interface IRotationFrame {
  jobId: string
  dicomId: string
  file: string
  cols: number
  rows: number
  value: number
  /* Контур измеренной области в пикселях снимка. */
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
