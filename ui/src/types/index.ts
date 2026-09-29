/* Types mirror the dicom-manager contract (../dicom-manager/docs/swagger.yaml).
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

/* manual — uploaded by an admin; clinic — uploaded by a specialist or Orthanc. */
export type UploadSource = 'manual' | 'clinic'

/* GET /dicom/{dicom_id} */
export interface IDicomInfo {
  id: string
  study_id?: string
  /* the DICOM identifiers of the visit and of the frame itself */
  dicom_study_uid?: string
  dicom_image_uid?: string
  patient_id?: string
  device_model?: string
  file_name?: string
  organization_id?: number
  creator_id?: number
  upload_source?: UploadSource | 'unknown'
  created_at?: string
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
  upload_source?: UploadSource
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
  /* the column exists in the dicom_file table but is missing from the DTO —
     requested in context/backend_requests.md, lists fall back to the job id */
  file_name?: string
  /* how the scan got here: sent by the densitometer or uploaded by hand.
     Requested in context/back_annotations.md — without it the annotation
     queue cannot tell the stream from the clinics from one's own uploads. */
  source?: 'device' | 'upload'
}

/* A visit: the scans taken for one patient during a single appointment. */
export interface IStudy {
  study_id: string
  patient_ref?: string
  created_at: string
  jobs: IJobInfo[]
}

/* POST /user/login response. */
export interface IUserResponse {
  role: UserRole
  token: string
  user_id: number
  organization_id: number
}

/* What is kept between sessions after a sign-in. */
export interface ISession {
  user_id: number
  organization_id: number
  role?: UserRole
  full_name?: string
}

export interface IUserInfo {
  id: number
  full_name: string
  role: UserRole
  organization_id: number
}

export interface IReport {
  id: number
  download_url: string
  created_at: string
}

export interface IDicomImage {
  image_data?: string
  image_data_raw?: string
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

/* ============================================================
   Annotation contour: annotating a frame, training the models on
   what was annotated, and picking the boundaries that turn a
   measured number into a verdict.

   Shapes follow dicom-analyzer/examples/annotation/README.md.
   The backend has no endpoints for any of it yet — see
   context/backend_requests.md.
   ============================================================ */

/* Which of the annotation tasks a frame is queued for. */
export type AnnotTask = 'hip_keypoints' | 'pelvis_crest' | 'foreign_seg'

/* A point of the frame as the annotator sees it:
     empty     — nothing on the image, the doctor places it
     suggested — there is a guess nobody has confirmed yet
     absent    — the anatomy is cut off by the frame edge
     checked   — settled
   The marker on the scan follows the same state, so badge and
   image never disagree. */
export type PointState = 'empty' | 'suggested' | 'absent' | 'checked'

/* What the annotator says about a point: the suggestion is right, or the
   anatomy is cut off by the frame edge. */
export type PointAnswer = 'confirmed' | 'absent'

/* Three states of a criterion across the whole contour:
   норма · сомнение · нарушение. Doubt is not a violation — the
   same rule the analyser follows. */
export type Band = 'norm' | 'warn' | 'viol'

/* Where the frames came from: the stream out of the clinics, or an upload. */
export type AnnotSource = 'clinic' | 'upload'

export interface IAnnotPrefill {
  x: number
  y: number
  present: boolean
  confidence: number
}

export interface IAnnotPoint {
  name: string
  title: string
  /* somebody has already looked at this suggestion: behind the flag sit the
     contract's origin values — human / model_confirmed versus model */
  reviewed?: boolean
  /* what the annotator has answered about this point on the desk, which
     outranks whatever the model suggested */
  answer?: PointAnswer
  /* [x0, y0, x1, y1] — the area of the frame where this point occurs.
     Absent when the contract has no box for a frame of this size: better no
     hint than a box drawn around the whole picture. */
  allowed_box?: [number, number, number, number]
  prefill: IAnnotPrefill | null
}

export interface IAnnotPolygon {
  cls: 'wire' | 'object'
  points: Point[]
}

export interface IAnnotCase {
  key: string
  task: AnnotTask
  file: string
  region: Region
  rows: number
  cols: number
  png: string
  items?: IAnnotPoint[]
  polygons?: IAnnotPolygon[]
  verdict?: string
  /* the frame arrived without a prefill: everything is placed by hand */
  blank?: boolean
}

/* One line of the queue: the frame itself, and why it is here. */
export interface IQueueItem {
  key: string
  task: AnnotTask
  file: string
  region: Region
  rows: number
  cols: number
  png: string
  source: AnnotSource
  from: string
  /* the analyser has already looked at this frame */
  pre: boolean
  why: string
  confidence: number | null
  /* 1 — срочно, 2 — в очереди, 3 — фон */
  priority: 1 | 2 | 3
}

/* How much has been collected for one of the four models. */
export interface ITrainTarget {
  id: string
  name?: string
  have: number
  need: number
  /* the cases that are scarce and therefore decide when training is worth it */
  hard: string
  ready: boolean
  busy: boolean
  /* while it is training: how far along, and how much longer */
  done?: number | null
  left_minutes?: number | null
}

/* A number a radiologist can argue with. `goal` is the direction it should
   move, so the difference column is arithmetic and not somebody's reading. */
export interface IModelMetric {
  name: string
  unit: string
  goal: 'up' | 'down'
  now: number
  next: number
}

export interface IModelVersion {
  id: string
  name?: string
  trained: string
  checked: number
  metrics: IModelMetric[]
}

/* A frame of the tuning set with the number that was measured on it. */
export interface ITuneFrame {
  key: string
  file: string
  region: Region
  rows: number
  cols: number
  png: string
  dist_mm: number
  /* the outline of the measured area, in frame pixels */
  bump: Point[][]
}
