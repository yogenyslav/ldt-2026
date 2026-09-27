import type { Decision, JobStatus, Region, VerdictKind } from '@/types'

/* Весь текст интерфейса русский: ключи API наружу не выходят. */

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

/* Названия критериев и норма. Ключи приходят из ML как есть. */
export const CRITERIA: Record<string, { name: string; norm: string }> = {
  spine_axis: { name: 'Ось позвоночника', norm: 'до 5°' },
  pelvis_crest: { name: 'Гребни подвздошных костей', norm: 'обе' },
  foreign_objects: { name: 'Посторонние предметы', norm: 'нет' },
  hip_keypoints: { name: 'Ключевые точки бедра', norm: '3 точки' },
  lesser_trochanter: { name: 'Ротация бедра', norm: '1,0–4,4 мм' },
}

/* Маркеры на снимке: одна русская буква, расшифровка — в ключе под снимком. */
export const POINT_MARK: Record<string, { mark: string; name: string }> = {
  greater_trochanter_apex: { mark: 'В', name: 'Большой вертел' },
  femoral_neck: { mark: 'Ш', name: 'Шейка бедра' },
  ischium: { mark: 'С', name: 'Седалищная кость' },
  crest_left: { mark: 'Г', name: 'Гребень подвздошной кости' },
  crest_right: { mark: 'Г', name: 'Гребень подвздошной кости' },
}

/* Как вердикт называется на экране лаборанта и в списках. */
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

export const SETTING_NAME: Record<string, string> = {
  trochanter_center_mm: 'центр нормы вертела, мм',
  trochanter_tol_percent: 'допуск, %',
  trochanter_yellow_percent: 'полоса проверки, %',
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
    group: 'Разбор',
    items: [
      { route: '/markup', label: 'Разметка', icon: 'pen' },
      { route: '/analytics', label: 'Аналитика', icon: 'chart' },
      { route: '/cases', label: 'Кейсы', icon: 'folder' },
    ],
  },
  {
    group: 'Система',
    items: [{ route: '/service', label: 'Служебное', icon: 'drive' }],
  },
] as const

/* Разделы, под которые у бекенда пока нет ручек. */
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
