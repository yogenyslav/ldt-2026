/* ============================================================
   Headless checks for the annotation contour: the pure logic, the
   shape of a submission, and the screens rendered to text so that
   the interface vocabulary can be read with a regular expression.

   There is no browser in this project, so this is how the logic is
   checked (context/retro/2026-09-27-frontend.md). Bundle it and run
   it — see ui/README.md.

   Everything here runs on DEMO_JOBS: real qc_prototype output on real
   DICOMs, the same answers the service returns from /job/info.
   ============================================================ */

import './storage'

import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { renderToStaticMarkup } from 'react-dom/server'
import { ToastProvider } from '@/components/ui/toast'
import AnnotProvider from '@/context/AnnotContext'
import AnnotQueueWidget from '@/components/widgets/annot/AnnotQueueWidget'
import AnnotDeskWidget from '@/components/widgets/annot/AnnotDeskWidget'
import TrainWidget from '@/components/widgets/annot/TrainWidget'
import TuneWidget from '@/components/widgets/annot/TuneWidget'
import { DEMO_JOBS } from '@/services/mock/demoJobs'
import {
  activeIndex,
  canClose,
  clearPoint,
  confirmPoint,
  leftToMark,
  nextKey,
  nextPoint,
  originOf,
  placeInQueue,
  placePoint,
  pointState,
  toggleAbsent,
  withEdits,
  type PointEdits,
} from '@/lib/annotation'
import { isStrokeWorthKeeping, outlineOf, simplifyOutline } from '@/lib/annotation'
import { annotTasks, caseOf, clampToBox, hasZones } from '@/lib/annotQueue'
import { delta } from '@/lib/tune'
import {
  ROTATION_DEFAULTS,
  centreToSettings,
  cutToSettings,
  modelsOf,
  normText,
  rotationBand,
  rotationCuts,
  rotationFrames,
  settingsOf,
} from '@/lib/settings'
import type { IAnnotCase, IJobInfo, Point } from '@/types'

let passed = 0
const failures: string[] = []

function ok(name: string, condition: boolean, detail = '') {
  if (condition) passed += 1
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const eq = (name: string, got: unknown, want: unknown) =>
  ok(
    name,
    JSON.stringify(got) === JSON.stringify(want),
    `получено ${JSON.stringify(got)}, ждали ${JSON.stringify(want)}`,
  )

/* ---------- 1. очередь выводится из разбора ---------- */

const tasks = annotTasks(DEMO_JOBS)

ok('очередь не пустая', tasks.length > 0)
ok(
  'в очередь попали только разобранные снимки',
  tasks.every((task) => DEMO_JOBS.find((job) => job.id === task.jobId)?.status === 'completed'),
)
ok('у каждого задания есть причина', tasks.every((task) => !!task.why))
ok('ключ задания — снимок и задача', tasks.every((task) => /^[^:]+:[a-z_]+$/.test(task.key)))
ok('ключи не повторяются', new Set(tasks.map((task) => task.key)).size === tasks.length)
ok(
  'у каждого задания есть снимок, который можно запросить',
  tasks.every((task) => !!task.dicomId && task.rows > 0 && task.cols > 0),
)

const clean: IJobInfo = {
  id: 'clean',
  dicom_id: 'd-clean',
  status: 'completed',
  anatomical_region: 'hip_left',
  created_at: '2026-09-28T09:00:00',
  metadata: {
    shape: [263, 280],
    criteria: {
      hip_keypoints: {
        name: 'hip_keypoints',
        ok: 1,
        points: { greater_trochanter_apex: [1, 1], femoral_neck: [2, 2], ischium: [3, 3] },
      },
    },
  },
}
eq('уверенный снимок в очередь не идёт', annotTasks([clean]).length, 0)

const short: IJobInfo = {
  ...clean,
  metadata: {
    ...clean.metadata,
    criteria: { hip_keypoints: { name: 'hip_keypoints', ok: 1, points: { femoral_neck: [2, 2] } } },
  },
}
eq('снимок с ненайденной точкой идёт', annotTasks([short]).length, 1)
eq('и причина названа', annotTasks([short])[0].why, 'модель нашла не все точки бедра')
eq('неразобранный снимок в очередь не идёт', annotTasks([{ ...clean, status: 'processing' }]).length, 0)

eq('место считается по очереди', placeInQueue(['a', 'b', 'c'], 'b'), '2 из 3')

/* фильтр по источнику опирается на поле контракта, а не на догадку */
const uploaded: IJobInfo = { ...short, id: 'up', source: 'upload' }
const fromClinic: IJobInfo = { ...short, id: 'dev', source: 'device' }
eq('загруженный снимок помечен как загруженный', annotTasks([uploaded])[0].source, 'upload')
eq('пришедший с аппарата — как из поликлиники', annotTasks([fromClinic])[0].source, 'clinic')
eq('без поля источника считаем потоком', annotTasks([short])[0].source, 'clinic')
eq(
  'фильтр делит очередь',
  annotTasks([uploaded, fromClinic]).filter((task) => task.source === 'upload').length,
  1,
)
eq('следующий идёт по той же очереди', nextKey(['a', 'b', 'c'], 'b'), 'c')
eq('после последнего следующего нет', nextKey(['a', 'b', 'c'], 'c'), null)

/* ---------- 2. снимок для разметки собирается из критериев ---------- */

const hipJob = DEMO_JOBS.find(
  (job) => job.anatomical_region?.startsWith('hip') && job.metadata?.criteria?.hip_keypoints,
)!
const hipCase = caseOf(hipJob, 'hip_keypoints', '/scan.png')!

ok('снимок бедра собрался', !!hipCase)
eq('три точки, как в контракте', hipCase.items!.length, 3)
eq(
  'порядок точек фиксирован',
  hipCase.items!.map((item) => item.name),
  ['greater_trochanter_apex', 'femoral_neck', 'ischium'],
)
eq('кадр взят из разбора', [hipCase.rows, hipCase.cols], hipJob.metadata!.shape)
ok('предсказание модели встало на место', hipCase.items!.some((item) => !!item.prefill))
ok(
  'координаты внутри кадра',
  hipCase.items!.every(
    (item) =>
      !item.prefill ||
      (item.prefill.x >= 0 &&
        item.prefill.x <= hipCase.cols &&
        item.prefill.y >= 0 &&
        item.prefill.y <= hipCase.rows),
  ),
)
ok('ни одна точка ещё не проверена', hipCase.items!.every((item) => !item.reviewed))

ok('для типового кадра зоны известны', hasZones(263))
ok('для нетипового — нет', !hasZones(999))

/* Настоящие кадры сервиса — 280×291, а таблица боксов в контракте ML расписана
   только для 280×263 и 280×235. Зону, которой не знаем, не рисуем. */
ok('у настоящего снимка зоны пока нет', !hipCase.items![0].allowed_box)

const typical: IJobInfo = { ...hipJob, metadata: { ...hipJob.metadata, shape: [263, 280] } }
const leftBox = caseOf({ ...typical, anatomical_region: 'hip_left' }, 'hip_keypoints', '')!.items![0]
  .allowed_box!
const rightBox = caseOf({ ...typical, anatomical_region: 'hip_right' }, 'hip_keypoints', '')!
  .items![0].allowed_box!
eq('бокс типового кадра — из контракта', leftBox, [105, 36.2, 255, 183.8])
eq('для правого бедра он отражён', rightBox, [280 - 1 - 255, 36.2, 280 - 1 - 105, 183.8])
ok('ширина бокса при отражении не меняется', rightBox[2] - rightBox[0] === leftBox[2] - leftBox[0])
eq('точку держим внутри зоны', clampToBox(leftBox, 10, 10), [105, 36.2])
eq('точку внутри зоны не двигаем', clampToBox(leftBox, 150, 100), [150, 100])

const spineJob = DEMO_JOBS.find((job) => job.metadata?.criteria?.foreign_objects)!
const foreignCase = caseOf(spineJob, 'foreign_seg', '/scan.png')!
eq('у задачи предметов точек нет', foreignCase.items, undefined)
ok('полигоны приезжают из критерия', Array.isArray(foreignCase.polygons))

/* ---------- 3. что делает разметчик ---------- */

const edited = (
  item: IAnnotCase,
  ...steps: Array<[number, 'place' | 'absent' | 'confirm' | 'clear', number?, number?]>
) => {
  let map: PointEdits = {}
  for (const [index, what, x, y] of steps) {
    if (what === 'place') map = placePoint(map, index, x!, y!)
    else if (what === 'absent') map = toggleAbsent(map, index)
    else if (what === 'confirm') map = confirmPoint(item, map, index)
    else map = clearPoint(map, index)
  }
  return { work: withEdits(item, map), map }
}

const placed = edited(hipCase, [0, 'place', 111.5, 92.5])
eq(
  'поставленная точка встаёт куда указали',
  [placed.work.items![0].prefill!.x, placed.work.items![0].prefill!.y],
  [111.5, 92.5],
)
eq('поставленная точка считается готовой', pointState(placed.work, 0), 'checked')
eq('и помечена как человеческая', originOf(placed.map, 0), 'human')
eq('её можно передвинуть', edited(hipCase, [0, 'place', 111.5, 92.5], [0, 'place', 130, 80]).work.items![0].prefill!.x, 130)

const confirmed = edited(hipCase, [0, 'confirm'])
eq('«всё верно» закрывает точку', pointState(confirmed.work, 0), 'checked')
eq('и помечена как подтверждённая', originOf(confirmed.map, 0), 'model_confirmed')
eq('координата модели сохранена', confirmed.work.items![0].prefill!.x, hipCase.items![0].prefill!.x)
eq('нетронутая точка остаётся моделью', originOf(edited(hipCase).map, 0), 'model')

const absent = edited(hipCase, [0, 'absent'])
eq('«нет на снимке» ставит своё состояние', pointState(absent.work, 0), 'absent')
eq(
  'поставленная точка отменяет «нет на снимке»',
  pointState(edited(hipCase, [0, 'absent'], [0, 'place', 100, 100]).work, 0),
  'checked',
)
ok('исходный снимок не тронут', !hipCase.items![0].answer)

const all = edited(hipCase, [0, 'confirm'], [1, 'confirm'], [2, 'confirm'])
eq('снимок закрыт', leftToMark(all.work), 0)
eq('когда отмечать нечего, точка остаётся в руке', nextPoint(all.work, 2), 2)
ok('конвейер берёт первую непроверенную', activeIndex(hipCase) >= 0)

eq('два угла — ещё не контур', canClose([[0, 0], [5, 0]]), false)
eq('три угла — уже контур', canClose([[0, 0], [5, 0], [5, 5]]), true)
eq(
  'обводка попадает на снимок',
  withEdits(foreignCase, {}, [{ cls: 'wire', points: [[0, 0], [5, 0], [5, 5]] }]).polygons!.length,
  1,
)

/* ---- след от мыши прореживается, но форму сохраняет ---- */

/* прямая, размеченная сотней точек, — это две точки */
const straight: Point[] = Array.from({ length: 100 }, (_, i) => [i, 0] as Point)
eq('точки на прямой выкидываются', simplifyOutline(straight).length, 2)

/* угол терять нельзя */
const corner: Point[] = [
  ...Array.from({ length: 50 }, (_, i) => [i, 0] as Point),
  ...Array.from({ length: 50 }, (_, i) => [49, i] as Point),
]
const thinnedCorner = simplifyOutline(corner)
ok('угол сохраняется', thinnedCorner.length >= 3 && thinnedCorner.length < 10)
ok(
  'вершина угла осталась на месте',
  thinnedCorner.some(([x, y]) => x === 49 && y === 0),
)

/* окружность: точек становится меньше, но контур не съезжает */
const circle: Point[] = Array.from({ length: 360 }, (_, degree) => {
  const angle = (degree * Math.PI) / 180
  return [100 + 30 * Math.cos(angle), 100 + 30 * Math.sin(angle)] as Point
})
const thinnedCircle = simplifyOutline(circle)
ok('окружность прорежена', thinnedCircle.length < circle.length / 4)
ok(
  'и осталась окружностью',
  thinnedCircle.every(([x, y]) => Math.abs(Math.hypot(x - 100, y - 100) - 30) < 1.5),
)
ok(
  'прореженные точки — подмножество исходных',
  thinnedCircle.every(([x, y]) => circle.some(([cx, cy]) => cx === x && cy === y)),
)

eq('контур не повторяет первую точку в конце', outlineOf([...circle, circle[0]]).at(-1)?.[0] !== circle[0][0] || outlineOf([...circle, circle[0]]).length < 4, true)
eq('случайный клик контуром не становится', isStrokeWorthKeeping([[10, 10], [10.5, 10], [10, 10.5]]), false)
eq('настоящая обводка сохраняется', isStrokeWorthKeeping(circle), true)
eq('двух точек мало в любом случае', isStrokeWorthKeeping([[0, 0], [50, 50]]), false)

/* ---------- 4. подбор параметров: настоящие настройки анализатора ---------- */

const live = settingsOf(DEMO_JOBS)!
ok('настройки нашлись в разборе снимка', !!live)
eq('это те самые три параметра', live, ROTATION_DEFAULTS)
eq('границы из настроек', rotationCuts(live), [0.2, 1, 4.4, 5.2])
eq('норма читается словами', normText(live), 'от 1,0 до 4,4 мм')
eq('ниже первой границы — нарушение', rotationBand(live, 0.1), 'viol')
eq('между первой и второй — сомнение', rotationBand(live, 0.5), 'warn')
eq('в середине — норма', rotationBand(live, 2.7), 'norm')
eq('за последней границей — нарушение', rotationBand(live, 7), 'viol')
eq('ровно на границе — уже следующая полоса', rotationBand(live, 0.2), 'warn')

const tighter = cutToSettings(live, 1, 1.6)
eq('внутренний бегунок меняет допуск', tighter.trochanter_tol_percent, 40.7)
eq('полоса сомнения не тронута', tighter.trochanter_yellow_percent, live.trochanter_yellow_percent)
ok('внешний бегунок расширяет сомнение', cutToSettings(live, 3, 6).trochanter_yellow_percent > live.trochanter_yellow_percent)
eq('границы остаются по возрастанию', rotationCuts(cutToSettings(live, 3, 6)).every((cut, i, a) => i === 0 || cut >= a[i - 1]), true)
eq('внешняя граница не заходит внутрь допуска', cutToSettings(live, 0, 2).trochanter_yellow_percent, 0)
eq('середина нормы тоже настройка', centreToSettings(live, 3.4).trochanter_center_mm, 3.4)

const frames = rotationFrames(DEMO_JOBS)
ok('снимки бедра нашлись', frames.length > 0)
ok('у каждого измерено расстояние', frames.every((frame) => typeof frame.value === 'number'))
ok('у каждого есть контур измеренной области', frames.every((frame) => frame.regions.length > 0))
ok(
  'контур лежит внутри кадра',
  frames.every((frame) =>
    frame.regions.every((region) =>
      region.every(([x, y]) => x >= 0 && y >= 0 && x <= frame.cols && y <= frame.rows),
    ),
  ),
)

const spreadOf = (settings: typeof live) => {
  const count = { norm: 0, warn: 0, viol: 0 }
  for (const frame of frames) count[rotationBand(settings, frame.value)] += 1
  return count
}
eq(
  'распределение сходится с числом снимков',
  Object.values(spreadOf(live)).reduce((a, b) => a + b, 0),
  frames.length,
)
ok('сдвиг границы меняет распределение', spreadOf(centreToSettings(live, 6)).norm !== spreadOf(live).norm)

/* ---------- 5. модели, которые крутит сервис ---------- */

const models = modelsOf(DEMO_JOBS)
eq('моделей пять, как в контракте', models.length, 5)
eq(
  'имена из контракта',
  models.map((model) => model.id).sort(),
  ['foreign_seg', 'hip_keypoints', 'pelvis_crest', 'pelvis_presence', 'region'],
)

eq('рост там, где нужен рост', delta({ name: '', unit: '%', goal: 'up', now: 86, next: 93 }), { text: '+7 п. п.', tone: 'ok' })
eq('рост там, где нужно падение', delta({ name: '', unit: '%', goal: 'down', now: 4, next: 5 }), { text: '+1 п. п.', tone: 'bad' })
eq('падение промаха — улучшение', delta({ name: '', unit: 'мм', goal: 'down', now: 22, next: 13 }), { text: '−9 мм', tone: 'ok' })
eq('без изменений', delta({ name: '', unit: '%', goal: 'up', now: 5, next: 5 }).text, 'без изменений')

/* ---------- 6. экраны: что видит врач ---------- */

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
client.setQueryData(['jobs', 50, 0], DEMO_JOBS)
for (const job of DEMO_JOBS) {
  client.setQueryData(['job', job.id], job)
  client.setQueryData(['dicom', job.dicom_id], { image_data: '/scan.png' })
}

const draw = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <AnnotProvider>{node}</AnnotProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )

const screens: Array<[string, string]> = [
  ['Очередь заданий', draw(<AnnotQueueWidget />)],
  ['Разметка снимка', draw(<AnnotDeskWidget />)],
  ['Дообучение модели', draw(<TrainWidget />)],
  ['Подбор параметров', draw(<TuneWidget />)],
]

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')

for (const [name, html] of screens) {
  ok(`${name}: экран нарисован`, html.length > 400, `${html.length} символов`)
  ok(`${name}: нет undefined`, !html.includes('undefined'))
  ok(`${name}: нет NaN`, !/\bNaN\b/.test(html))
}

/* словарь интерфейса из ретро: чего на экране быть не должно */
const BANNED: Array<[RegExp, string]> = [
  [/\bпрограмм/i, 'программа — только «модель»'],
  [/\bбугор|бугра|бугре/i, 'бугор — только «малый вертел»'],
  [/эталон/i, 'эталона на проде нет'],
  [/датасет/i, 'датасета на проде нет'],
  [/\bпорог/i, 'порогов на экране нет'],
  [/\bэпох/i, 'эпох обучения на экране нет'],
  [/\bметрик/i, 'метрик обучения на экране нет'],
  [/allowed_box|keypoints|presence|prefill|submission/i, 'имена из контракта'],
  [/\bjson\b/i, 'JSON на экране нет'],
  [/не уверена/i, 'женский род — только «сомневаюсь»'],
  [/ручк[аиу]\b|эндпоинт|endpoint/i, 'служебное про бекенд'],
]

for (const [name, html] of screens) {
  const body = text(html)
  for (const [pattern, why] of BANNED) {
    const hit = body.match(pattern)
    ok(`${name}: ${why}`, !hit, hit ? `найдено «${hit[0]}»` : '')
  }
}

const everything = screens.map(([, html]) => text(html)).join(' ')
for (const word of ['норма', 'сомнение', 'нарушение', 'малый вертел', 'модел']) {
  ok(`словарь: «${word}» на экранах есть`, everything.includes(word))
}

const queueScreen = text(screens[0][1])
for (const word of ['Очередь заданий', 'ждут разметки', 'размеченные', 'Добавить снимки', 'Источник', 'из поликлиник', 'загруженные']) {
  ok(`очередь: «${word}»`, queueScreen.includes(word))
}

const desk = text(screens[1][1])
for (const word of ['Готово, следующий', 'сомневаюсь', 'пропустить', 'Особенности снимка', 'Очередь', 'из поликлиник']) {
  ok(`разметка: «${word}»`, desk.includes(word))
}
ok('разметка: демо-переключателей снимков нет', !desk.includes('без подсказок'))

const tune = text(screens[3][1])
for (const word of ['Середина нормы', 'Допуск', 'Полоса сомнения', '2,7 мм', '63 %', '30 %', 'от 1,0 до 4,4 мм']) {
  ok(`параметры: «${word}» с разбора снимка`, tune.includes(word))
}
ok('параметры: совпадения не считаются', !/совпад/i.test(tune))

const train = text(screens[2][1])
for (const word of ['Модели в работе', 'Ключевые точки бедра', 'Гребни подвздошных костей']) {
  ok(`дообучение: «${word}» из разбора`, train.includes(word))
}

/* ---------- итог ---------- */

console.log(`\nпроверок пройдено: ${passed}`)
if (failures.length) {
  console.log(`не прошло: ${failures.length}`)
  for (const line of failures) console.log('  ✕ ' + line)
  process.exit(1)
}
console.log('всё сходится')
