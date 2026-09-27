import { CRITERIA } from '@/constants'
import { nm } from '@/lib/utils'
import { levelOfCriterion } from '@/lib/verdict'
import type { ICriterion, IJobInfo, VerdictKind } from '@/types'

export interface ICriterionRow {
  key: string
  name: string
  value: string
  norm: string
  level: VerdictKind | ''
  detail: string
}

const num = (details: Record<string, unknown>, key: string) => {
  const value = details[key]
  return typeof value === 'number' ? value : null
}

const text = (details: Record<string, unknown>, key: string) => {
  const value = details[key]
  return typeof value === 'string' ? value : ''
}

/* Значение критерия человеческим языком: строка должна читаться сама,
   без пояснения под ней. */
function criterionValue(key: string, criterion: ICriterion): string {
  const details = criterion.details ?? {}

  if (key === 'spine_axis') {
    return criterion.value === null || criterion.value === undefined
      ? 'не измерена'
      : `${nm(criterion.value)}°`
  }

  if (key === 'pelvis_crest') {
    const square = (details.square ?? {}) as Record<string, boolean>
    if (square.left_ok && square.right_ok) return 'обе стороны в кадре'
    if (square.left_ok) return 'правый вне кадра'
    if (square.right_ok) return 'левый вне кадра'
    return 'обе стороны вне кадра'
  }

  if (key === 'foreign_objects') {
    const verdict = text(details, 'verdict')
    if (verdict === 'ПРЕДМЕТ') return 'найдена дужка'
    if (verdict === 'проверить') return 'возможна застёжка'
    return 'не обнаружены'
  }

  if (key === 'hip_keypoints') {
    return Object.keys(criterion.points ?? {}).length === 3 ? 'все три найдены' : 'не найдены'
  }

  if (key === 'lesser_trochanter') {
    if (text(details, 'status') === 'не измерен' || !criterion.value) return 'не измерена'
    return `${nm(criterion.value)} мм`
  }

  return '—'
}

/* Пояснение — связный текст: что измерено, как это соотносится с нормой
   и что делать. Раскрывается по клику на строку. */
function criterionDetail(key: string, criterion: ICriterion, level: VerdictKind | ''): string {
  const details = criterion.details ?? {}

  if (criterion.note && level !== 'ok') {
    return `${criterion.note.charAt(0).toUpperCase()}${criterion.note.slice(1)}.`
  }

  if (key === 'spine_axis') {
    if (criterion.value === null || criterion.value === undefined) {
      return 'Столб кости не найден, угол оси измерить не удалось.'
    }
    const angle = nm(Math.abs(criterion.value))
    return level === 'ok'
      ? `Ось отклонена на ${angle}° при допуске 5°. Укладка в норме.`
      : `Ось отклонена на ${angle}° при допуске 5°. Выровняйте пациента по центральной линии стола и повторите укладку.`
  }

  if (key === 'pelvis_crest') {
    const square = (details.square ?? {}) as Record<string, boolean>
    if (square.left_ok && square.right_ok) {
      return 'Верхние края подвздошных костей видны с обеих сторон снимка.'
    }
    const side = !square.left_ok && !square.right_ok
      ? 'Оба гребня'
      : square.left_ok
        ? 'Гребень справа'
        : 'Гребень слева'
    return `${side} не попал в кадр. Сместите зону сканирования ниже, чтобы верхние края подвздошных костей были видны, и повторите снимок.`
  }

  if (key === 'foreign_objects') {
    const verdict = text(details, 'verdict')
    if (verdict === 'ПРЕДМЕТ') {
      return 'На снимке найдена дужка бюстгальтера — она искажает измерение плотности. Попросите пациента снять бельё с металлическими элементами и переснимите.'
    }
    if (verdict === 'проверить') {
      return 'Найден предмет, похожий на застёжку. Признак слабый, поэтому посмотрите на снимок сами: если предмет попадает в зону измерения, переснимите.'
    }
    return 'Посторонних предметов и артефактов на снимке не найдено.'
  }

  if (key === 'hip_keypoints') {
    return level === 'ok'
      ? 'Найдены все три опорные точки: большой вертел, шейка бедра и седалищная кость. На снимке они отмечены буквами В, Ш и С.'
      : 'Модель не нашла опорные точки бедра, поэтому ротацию измерить не удалось. Уложите конечность прямо, без наклона и перекрытия тканями, и повторите снимок.'
  }

  if (key === 'lesser_trochanter') {
    const status = text(details, 'status')
    if (status === 'не измерен' || !criterion.value) {
      return 'Ротацию не измеряли: не найдены опорные точки бедра.'
    }
    const distance = nm(criterion.value)
    if (status === 'проверить') {
      return `Расстояние до малого вертела ${distance} мм — чуть за пределами нормы от 1,0 до 4,4 мм. Посмотрите на снимок сами: если бугор хорошо заметен, разверните стопу внутрь и переснимите.`
    }
    if (level === 'ok') {
      return `Расстояние до малого вертела ${distance} мм при норме от 1,0 до 4,4 мм. Стопа развёрнута правильно.`
    }
    return `Расстояние до малого вертела ${distance} мм при норме от 1,0 до 4,4 мм — бедро развёрнуто наружу. Разверните стопу внутрь до упора в фиксаторе и переснимите.`
  }

  return ''
}

/* Отступы бедра разворачиваем в три строки: у каждого своя норма,
   и число рядом с нормой читается без пояснений. */
function marginRow(key: string, name: string, side: string, value: number | null, min: number): ICriterionRow {
  const ok = value !== null && value >= min
  let detail: string

  if (value === null) {
    detail = 'Седалищная кость не найдена, поэтому отступ снизу измерить не удалось. Повторите снимок так, чтобы кость целиком попала в кадр.'
  } else if (ok) {
    detail = `От кости до края кадра ${side} ${nm(value)} см при норме от ${nm(min, 0)} см. Запас достаточный.`
  } else {
    detail = `От кости до края кадра ${side} всего ${nm(value)} см, норма — от ${nm(min, 0)} см. Сместите зону сканирования так, чтобы кость не подходила к краю кадра, и повторите снимок.`
  }

  return {
    key,
    name,
    level: ok ? 'ok' : 'bad',
    detail,
    value: value === null ? 'не измерен' : `${nm(value)} см`,
    norm: `от ${nm(min, 0)} см`,
  }
}

export function criteriaRows(job: IJobInfo): ICriterionRow[] {
  const criteria = job.metadata?.criteria ?? {}
  const rows: ICriterionRow[] = []

  for (const key of Object.keys(criteria)) {
    const criterion = criteria[key]
    const level = levelOfCriterion(criterion)

    if (key === 'hip_margins') {
      const details = criterion.details ?? {}
      rows.push(marginRow('margin_top', 'Отступ сверху', 'сверху', num(details, 'top_cm'), 3))
      rows.push(marginRow('margin_side', 'Отступ сбоку', 'сбоку', num(details, 'side_cm'), 2))
      rows.push(marginRow('margin_bottom', 'Отступ снизу', 'снизу', num(details, 'bottom_cm'), 3))
      continue
    }

    rows.push({
      key,
      name: CRITERIA[key]?.name ?? key,
      norm: CRITERIA[key]?.norm ?? '',
      level,
      value: criterionValue(key, criterion),
      detail: criterionDetail(key, criterion, level),
    })
  }

  return rows
}

/* Короткий список нарушений для подзаголовка вердикта. */
export function brokenNames(job: IJobInfo): string[] {
  return criteriaRows(job)
    .filter((row) => row.level === 'bad' || row.level === 'warn')
    .map((row) => row.name.toLowerCase())
}
