/* Types mirror the dicom-manager contract (context/swagger.yaml).
   The study_id, patient_ref, study_date and device fields were requested
   from the backend developer — see context/backend_requests.md. */

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed'

export type Decision = 'approved' | 'rejected' | 'force_approved'

export type UserRole = 'specialist' | 'admin'

export type Region = 'spine' | 'hip_left' | 'hip_right'

/* Level at which the UI presents a criterion or the whole scan. */
export type VerdictKind = 'ok' | 'warn' | 'bad' | 'none' | 'failed' | 'wait'

export type Point = [number, number]

/* Shared criterion shape from qc_prototype/qc/types.py.
   Point and polygon coordinates are pixels of the original scan. */
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
  /* duplicated in metadata; lifted to the top level for convenient lists */
  study_id?: string
  patient_ref?: string
}

/* A visit: the scans taken for one patient during a single appointment. */
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
  /* UI scope; the backend does not yet distinguish a technologist from a
     radiologist — see item 4 in context/backend_requests.md */
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

/* The UI scope is decided by the role returned at sign-in. */
export type Scope = 'post' | 'center'

export interface IAuthContext {
  isAuth: boolean
  setIsAuth: React.Dispatch<React.SetStateAction<boolean>>
  scope: Scope
  setScope: React.Dispatch<React.SetStateAction<Scope>>
}
