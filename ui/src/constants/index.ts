import type {
  AnnotSource,
  AnnotTask,
  Band,
  Decision,
  JobStatus,
  PointState,
  Region,
  VerdictKind,
} from '@/types'

/* All UI copy is Russian; API keys never reach the user. */

export const REGION: Record<Region, string> = {
  spine: 'Поясничный отдел позвоночника',
  hip_left: 'Левое бедро',
  hip_right: 'Правое бедро',
}

export const REGION_SHORT: Record<Region, string> = {
  spine: 'Позвоночник',
  hip_left: 'Левое бедро',
  hip_right: 'Правое бедро',
}

export const STATUS: Record<JobStatus, string> = {
  pending: 'В очереди',
  processing: 'Обрабатывается',
  completed: 'Обработано',
  failed: 'Ошибка обработки',
}

export const DECISION: Record<Decision, string> = {
  approved: 'Принято',
  rejected: 'Отклонено, переснять',
  force_approved: 'Принято вопреки рекомендации',
}

/* Criterion names and limits. Keys arrive from ML as they are. */
export const CRITERIA: Record<string, { name: string; norm: string }> = {
  spine_axis: { name: 'Ось позвоночника', norm: 'до 5°' },
  pelvis_crest: { name: 'Гребни подвздошных костей', norm: 'обе' },
  foreign_objects: { name: 'Посторонние предметы', norm: 'нет' },
  hip_keypoints: { name: 'Ключевые точки бедра', norm: '3 точки' },
  lesser_trochanter: { name: 'Ротация бедра', norm: '1,0–4,4 мм' },
}

/* Scan markers: a single Cyrillic letter, explained in the key below the scan. */
export const POINT_MARK: Record<string, { mark: string; name: string }> = {
  greater_trochanter_apex: { mark: 'В', name: 'Большой вертел' },
  femoral_neck: { mark: 'Ш', name: 'Шейка бедра' },
  ischium: { mark: 'С', name: 'Седалищная кость' },
  crest_left: { mark: 'Г', name: 'Гребень подвздошной кости' },
  crest_right: { mark: 'Г', name: 'Гребень подвздошной кости' },
}

/* How the verdict is worded on the station screen and in lists. */
export const VERDICT_POST: Record<VerdictKind, { title: string; tone: string }> = {
  ok: { title: 'КОРРЕКТНО', tone: 'ok' },
  warn: { title: 'НУЖЕН ВЗГЛЯД СПЕЦИАЛИСТА', tone: 'warn' },
  bad: { title: 'ПЕРЕСНЯТЬ', tone: 'bad' },
  none: { title: 'НЕ ОЦЕНЕНО', tone: 'none' },
  failed: { title: 'ОШИБКА', tone: 'bad' },
  wait: { title: 'ОБРАБОТКА', tone: 'none' },
}

export const VERDICT_LIST: Record<VerdictKind, { title: string; tone: string }> = {
  ok: { title: 'Корректно', tone: 'ok' },
  warn: { title: 'Нужен взгляд специалиста', tone: 'warn' },
  bad: { title: 'Переснять', tone: 'bad' },
  none: { title: 'Не оценено', tone: 'none' },
  failed: { title: 'Ошибка', tone: 'bad' },
  wait: { title: 'В обработке', tone: 'none' },
}

export const MODEL_NAME: Record<string, string> = {
  region: 'Определение области съёмки',
  hip_keypoints: 'Ключевые точки бедра',
  pelvis_crest: 'Гребни подвздошных костей',
  pelvis_presence: 'Наличие гребня в окне',
  foreign_seg: 'Посторонние предметы',
}

export const SETTING_TEXT: Record<string, (value: string) => string> = {
  trochanter_center_mm: (value) => `центр нормы вертела ${value} мм`,
  trochanter_tol_percent: (value) => `допуск ${value}%`,
  trochanter_yellow_percent: (value) => `полоса проверки ${value}%`,
}

export const sidebarLinks = [
  {
    group: 'Работа',
    items: [
      { route: '/', label: 'Очередь', icon: 'list' },
      { route: '/batch', label: 'Пакетная обработка', icon: 'layers' },
      { route: '/reports', label: 'Отчёты', icon: 'file' },
    ],
  },
  {
    group: 'Разметка',
    items: [
      { route: '/markup', label: 'Очередь заданий', icon: 'inbox' },
      { route: '/markup/frame', label: 'Разметка снимка', icon: 'pen' },
    ],
  },
  {
    group: 'Дообучение и подбор параметров',
    items: [
      { route: '/training', label: 'Дообучение модели', icon: 'brain' },
      { route: '/tuning', label: 'Подбор параметров', icon: 'sliders' },
    ],
  },
  {
    group: 'Разбор',
    items: [
      { route: '/analytics', label: 'Аналитика', icon: 'chart' },
      { route: '/cases', label: 'Кейсы', icon: 'folder' },
    ],
  },
  {
    group: 'Система',
    items: [{ route: '/service', label: 'Служебное', icon: 'drive' }],
  },
] as const

/* Sections the backend has no endpoints for yet. */
export const SOON: Record<string, { title: string; text: string }> = {
  markup: {
    title: 'Разметка',
    text: 'Ручная правка найденной оси позвоночника и ключевых точек бедра с сохранением исправленной геометрии.',
  },
  analytics: {
    title: 'Аналитика качества',
    text: 'Доля брака по сети, разбивка по аппаратам, зонам и типам нарушений, динамика по неделям.',
  },
  cases: {
    title: 'Библиотека кейсов',
    text: 'Отобранные примеры нарушений для обучения лаборантов и для демонстрации возможностей сервиса.',
  },
}

/* ============================================================
   Annotation contour. The reader is a radiologist: nothing here
   names a model file, a threshold or a coordinate system, and the
   three states are the same three words used everywhere else —
   норма · сомнение · нарушение.
   ============================================================ */

/* Point names as a doctor says them, not as the model files spell them. */
export const ANNOT_POINT_NAME: Record<string, string> = {
  greater_trochanter_apex: 'Верхушка большого вертела',
  femoral_neck: 'Центр шейки бедра',
  ischium: 'Нижний край седалищной кости',
  crest_left: 'Гребень подвздошной кости слева',
  crest_right: 'Гребень подвздошной кости справа',
}

/* What the queue is asking for on a given frame. The fourth task has no card of
   its own: its answer is the same checkbox as in the third. */
export const ANNOT_TASK: Record<AnnotTask, string> = {
  hip_keypoints: 'Точки бедра',
  pelvis_crest: 'Гребни и окна',
  foreign_seg: 'Посторонний предмет',
}

export const ANNOT_CASE_TITLE: Record<string, string> = {
  hip_left: 'Левое бедро',
  hip_right: 'Правое бедро',
  spine_ok: 'Поясничный отдел',
  spine_bad: 'Поясничный отдел · гребень обрезан',
  spine_foreign: 'Поясничный отдел · предмет',
}

export const ANNOT_SOURCE: Record<AnnotSource | 'all', string> = {
  all: 'вся очередь',
  clinic: 'из поликлиник',
  upload: 'загруженные',
}

export const ANNOT_SOURCE_TAG: Record<AnnotSource, string> = {
  clinic: 'из поликлиники',
  upload: 'загружено',
}

export const ANNOT_PRIORITY: Record<number, { title: string; tone: string }> = {
  1: { title: 'срочно', tone: 'bad' },
  2: { title: 'в очереди', tone: 'warn' },
  3: { title: 'фон', tone: 'dead' },
}

/* How a point reads in the list beside the scan. */
export const POINT_STATE: Record<PointState, { title: string; tone: string }> = {
  empty: { title: 'не поставлена', tone: 'dead' },
  absent: { title: 'нет на снимке', tone: 'bad' },
  suggested: { title: 'проверьте', tone: 'warn' },
  checked: { title: 'готово', tone: 'ok' },
}

/* The three states, wherever they are named. */
export const BAND: Record<Band, { title: string; tone: string }> = {
  norm: { title: 'норма', tone: 'ok' },
  warn: { title: 'сомнение', tone: 'warn' },
  viol: { title: 'нарушение', tone: 'bad' },
}

/* What the annotator answers about a foreign object, in the order the buttons
   sit on the screen. A clean frame is just as needed an answer as a dirty one. */
export const FOREIGN_ANSWER: Array<{ id: string; title: string }> = [
  { id: 'ПРЕДМЕТ', title: 'Предмет есть' },
  { id: 'проверить', title: 'Нужно посмотреть' },
  { id: 'чисто', title: 'Снимок чистый' },
]

/* What the annotator obviously has to draw, named as a doctor names it. */
export const FOREIGN_KIND: Array<{ id: string; title: string; tone: string }> = [
  { id: 'wire', title: 'Дужка бюстгальтера', tone: 'bad' },
  { id: 'object', title: 'Застёжка, пуговица, кулон', tone: 'ok' },
]

/* Things worth saying about a frame that no task asks about. */
export const FRAME_FEATURE = ['не та область тела', 'эндопротез', 'брак снимка'] as const
