/* Типы повторяют контракт dicom-manager (context/swagger.yaml).
   Поля study_id, patient_ref, study_date и device запрошены у бекендера —
   см. context/backend_requests.md. */

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type Decision = 'approved' | 'rejected' | 'force_approved'

export type UserRole = 'specialist' | 'admin'

export type Region = 'spine' | 'hip_left' | 'hip_right'

/* Уровень, в котором интерфейс показывает критерий или весь снимок. */
export type VerdictKind = 'ok' | 'warn' | 'bad' | 'none' | 'failed' | 'wait'

export type Point = [number, number]

/* Единый формат критерия из qc_prototype/qc/types.py.
   Координаты точек и полигонов — пиксели исходного снимка. */
export interface ICriterion {
  name: string
  ok: 0 | 1 | null
  source?: string
  value?: number | null
  unit?: string
  points?: Record<string, Point>
  regions?: Point[][]
  details?: Record<string, unknown>
  note?: string
}

export interface IClassification {
  source?: string
  votes?: Record<string, string>
  agreement?: number
  unanimous?: boolean
  n_peaks?: number
  cnn_confidence?: number | null
}

export interface IJobMetadata {
  shape?: [number, number]
  verdict?: 0 | 1 | null
  criteria?: Record<string, ICriterion>
  classification?: IClassification
  models?: Record<string, string>
  settings?: Record<string, number>
  study_id?: string
  patient_ref?: string
  study_date?: string
  device?: string
}

export interface IJobInfo {
  id: string
  dicom_id: string
  status: JobStatus
  anatomical_region?: Region | null
  confidence?: number | null
  violations?: string[]
  duration_ms?: number | null
  metadata?: IJobMetadata
  specialist_id?: number | null
  specialist_decision?: Decision | null
  specialist_name?: string
  comment?: string
  created_at: string
  updated_at?: string
  error?: string
  /* дублируются в metadata; вынесены наверх для удобства списков */
  study_id?: string
  patient_ref?: string
}

/* Посещение: снимки, сделанные пациенту за один приход. */
export interface IStudy {
  study_id: string
  patient_ref?: string
  created_at: string
  jobs: IJobInfo[]
}

export interface IUserResponse {
  token: string
  user_id: number
  org_id: number
  role: UserRole
  /* контур интерфейса; пока бекенд не различает лаборанта и врача,
     см. пункт 4 в context/backend_requests.md */
  scope?: Scope
}

export interface IUserInfo {
  id: number
  full_name: string
  role: UserRole
  organisation_ids: number[]
}

export interface IReport {
  id: number
  download_url: string
  created_at: string
}

export interface IDicomImage {
  image_data?: string
  image_data_raw?: number[]
}

export interface IUploadedDicom {
  dicom_id: string
  job_id: string
}

/* Контур интерфейса определяется ролью при входе. */
export type Scope = 'post' | 'center'

export interface IAuthContext {
  isAuth: boolean
  setIsAuth: React.Dispatch<React.SetStateAction<boolean>>
  scope: Scope
  setScope: React.Dispatch<React.SetStateAction<Scope>>
}
