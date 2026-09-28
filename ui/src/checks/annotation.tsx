/* ============================================================
   Headless checks for the annotation contour: the pure logic, the
   demo store, and the four screens rendered to text so that the
   interface vocabulary can be read with a regular expression.

   There is no browser in this project, so this is how the logic is
   checked (context/retro/2026-09-27-frontend.md). Bundle it and run
   it — see ui/README.md.
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
import annotStore from '@/services/mock/annotStore'
import { ANNOT_CASES } from '@/services/mock/annotCases'
import {
  activeIndex,
  blankCase,
  leftToMark,
  nextKey,
  nextPoint,
  placeInQueue,
  pointState,
  pointStates,
  queueKeys,
  placePoint,
  toggleAbsent,
  confirmPoint,
  clearPoint,
  canClose,
  withEdits,
  type PointEdits,
} from '@/lib/annotation'
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
import { DEMO_JOBS } from '@/services/mock/demoJobs'

let passed = 0
const failures: string[] = []

function ok(name: string, condition: boolean, detail = '') {
  if (condition) passed += 1
  else failures.push(`${name}${detail ? ` — ${detail}` : ''}`)
}

const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, JSON.stringify(got) === JSON.stringify(want), `получено ${JSON.stringify(got)}, ждали ${JSON.stringify(want)}`)

/* ---------- 1. точки на снимке ---------- */

const hipLeft = ANNOT_CASES.find((item) => item.key === 'hip_left')!
const hipRight = ANNOT_CASES.find((item) => item.key === 'hip_right')!
const foreign = ANNOT_CASES.find((item) => item.key === 'spine_foreign')!

eq('все точки левого бедра проверены', pointStates(hipLeft), ['checked', 'checked', 'checked'])
eq('у правого бедра две догадки ждут проверки', pointStates(hipRight), [
  'checked',
  'suggested',
  'suggested',
])
eq('конвейер берёт первую непроверенную точку', activeIndex(hipRight), 1)
eq('на готовом снимке в руке последняя точка', activeIndex(hipLeft), 2)
eq('осталось отметить на правом бедре', leftToMark(hipRight), 2)
eq('на готовом снимке отмечать нечего', leftToMark(hipLeft), 0)

const blank = blankCase(hipRight)
eq('снимок без подсказок: все точки пустые', pointStates(blank), ['empty', 'empty', 'empty'])
eq('снимок без подсказок начинается с первой точки', activeIndex(blank), 0)
ok('исходный снимок не изменён', pointStates(hipRight)[1] === 'suggested')
ok('у снимка без подсказок нет полигонов', (blankCase(foreign).polygons ?? []).length === 0)
ok('у предметов нет отдельных точек', (foreign.items ?? []).length === 0)
eq('пустой снимок с предметами требует ответа', leftToMark(blankCase(foreign)), 1)

/* ответ разметчика перекрывает догадку модели */
const edited = (...steps: Array<[number, 'place' | 'absent' | 'confirm' | 'clear', number?, number?]>) => {
  let map: PointEdits = {}
  for (const [index, what, x, y] of steps) {
    if (what === 'place') map = placePoint(map, index, x!, y!)
    else if (what === 'absent') map = toggleAbsent(map, index)
    else if (what === 'confirm') map = confirmPoint(hipRight, map, index)
    else map = clearPoint(map, index)
  }
  return withEdits(hipRight, map)
}

const confirmed = edited([1, 'confirm'])
eq('«всё верно» закрывает точку', pointState(confirmed, 1), 'checked')
eq('после «всё верно» конвейер идёт дальше', nextPoint(confirmed, 1), 2)
eq('«всё верно» сохраняет координату модели', [confirmed.items![1].prefill!.x, confirmed.items![1].prefill!.y],
   [hipRight.items![1].prefill!.x, hipRight.items![1].prefill!.y])

const placed = edited([1, 'place', 111.5, 92.5])
eq('поставленная точка встаёт куда указали', [placed.items![1].prefill!.x, placed.items![1].prefill!.y], [111.5, 92.5])
eq('поставленная точка считается готовой', pointState(placed, 1), 'checked')
eq('её можно передвинуть', edited([1, 'place', 111.5, 92.5], [1, 'place', 130, 80]).items![1].prefill!.x, 130)
eq('и вернуть как было', pointState(edited([1, 'place', 130, 80], [1, 'clear']), 1), 'suggested')

const absent = edited([1, 'absent'])
eq('«нет на снимке» ставит своё состояние', pointState(absent, 1), 'absent')
eq('повторное «нет на снимке» снимает ответ', pointState(edited([1, 'absent'], [1, 'absent']), 1), 'suggested')
eq('поставленная точка отменяет «нет на снимке»', pointState(edited([1, 'absent'], [1, 'place', 100, 100]), 1), 'checked')
ok('исходный снимок по-прежнему не тронут', pointStates(hipRight)[1] === 'suggested')

const done = edited([1, 'confirm'], [2, 'confirm'])
eq('когда отмечать нечего, точка остаётся в руке', nextPoint(done, 2), 2)
eq('снимок закрыт', leftToMark(done), 0)

/* обводка замыкается только когда в ней есть площадь */
eq('два угла — ещё не контур', canClose([[0, 0], [5, 0]]), false)
eq('три угла — уже контур', canClose([[0, 0], [5, 0], [5, 5]]), true)
const drawn = withEdits(foreign, {}, [{ cls: 'wire', points: [[0, 0], [5, 0], [5, 5]] }])
eq('обводка попадает на снимок', drawn.polygons!.length, 1)
ok('исходный снимок с предметами не тронут', (foreign.polygons ?? []).length === 3)

/* ---------- 2. очередь и место в ней ---------- */

const queue = annotStore.queue()
eq('очередь целиком', queueKeys(queue, 'all').length, 5)
eq('из поликлиник', queueKeys(queue, 'clinic'), ['spine_foreign', 'hip_left', 'spine_ok'])
eq('загруженные', queueKeys(queue, 'upload'), ['spine_bad', 'hip_right'])
eq('место считается по той очереди, что на экране', placeInQueue(queueKeys(queue, 'clinic'), 'hip_left'), '2 из 3')
eq('следующий идёт по той же очереди', nextKey(queueKeys(queue, 'clinic'), 'hip_left'), 'spine_ok')
eq('после последнего следующего нет', nextKey(queueKeys(queue, 'clinic'), 'spine_ok'), null)

/* отправленный снимок уходит из очереди */
annotStore.finish('hip_left')
eq('отправленный снимок ушёл из очереди', queueKeys(annotStore.queue(), 'all').includes('hip_left'), false)
eq('очередь стала короче', annotStore.queue().length, 4)
eq('и из своей части очереди тоже', queueKeys(annotStore.queue(), 'clinic').length, 2)
eq('соседняя часть очереди не тронута', queueKeys(annotStore.queue(), 'upload').length, 2)
eq('место пересчитывается по укоротившейся очереди',
   placeInQueue(queueKeys(annotStore.queue(), 'clinic'), 'spine_ok'), '2 из 2')

/* ---------- 3. дообучение ---------- */

eq('обучается одна модель', annotStore.targets().filter((t) => t.busy).length, 1)
annotStore.train(['pelvis_crest'])
eq('после запуска обучаются две', annotStore.targets().filter((t) => t.busy).length, 2)
eq('новых версий две', annotStore.versions().length, 2)
annotStore.switchOver(['pelvis_crest'])
eq('переведённая версия больше не новая', annotStore.versions().map((v) => v.id), ['foreign_seg'])

eq('рост там, где нужен рост', delta({ name: '', unit: '%', goal: 'up', now: 86, next: 93 }), {
  text: '+7 п. п.',
  tone: 'ok',
})
eq('рост там, где нужно падение', delta({ name: '', unit: '%', goal: 'down', now: 4, next: 5 }), {
  text: '+1 п. п.',
  tone: 'bad',
})
eq('падение промаха — улучшение', delta({ name: '', unit: 'мм', goal: 'down', now: 22, next: 13 }), {
  text: '−9 мм',
  tone: 'ok',
})
eq('без изменений', delta({ name: '', unit: '%', goal: 'up', now: 5, next: 5 }).text, 'без изменений')

/* ---------- 4. подбор параметров: настоящие настройки анализатора ---------- */

/* Настройки приезжают с разбором снимка, а не из отдельного списка. */
const live = settingsOf(DEMO_JOBS)!
ok('настройки нашлись в разборе снимка', !!live)
eq('это те самые три параметра', live, ROTATION_DEFAULTS)

/* Границы считаются из середины и допусков — ровно так, как их применяет
   анализатор: 2,7 ± 63 % и ещё 30 % на сомнение. */
eq('границы из настроек', rotationCuts(live), [0.2, 1, 4.4, 5.2])
eq('норма читается словами', normText(live), 'от 1,0 до 4,4 мм')
eq('ниже первой границы — нарушение', rotationBand(live, 0.1), 'viol')
eq('между первой и второй — сомнение', rotationBand(live, 0.5), 'warn')
eq('в середине — норма', rotationBand(live, 2.7), 'norm')
eq('за последней границей — нарушение', rotationBand(live, 7), 'viol')
eq('ровно на границе — уже следующая полоса', rotationBand(live, 0.2), 'warn')

/* Бегунок двигает параметр, а не картинку, и двигает обе стороны сразу. */
const tighter = cutToSettings(live, 1, 1.6)
eq('внутренний бегунок меняет допуск', tighter.trochanter_tol_percent, 40.7)
eq('и норма сужается симметрично', rotationCuts(tighter)[2], Number((2.7 * 1.407).toFixed(1)))
eq('полоса сомнения не тронута', tighter.trochanter_yellow_percent, live.trochanter_yellow_percent)

const wider = cutToSettings(live, 3, 6)
eq('внешний бегунок меняет полосу сомнения', wider.trochanter_tol_percent, live.trochanter_tol_percent)
ok('и она расширяется', wider.trochanter_yellow_percent > live.trochanter_yellow_percent)
eq('границы остаются по возрастанию', rotationCuts(wider).every((cut, i, all) => i === 0 || cut >= all[i - 1]), true)

eq('внешняя граница не заходит внутрь допуска', cutToSettings(live, 0, 2.0).trochanter_yellow_percent, 0)
eq('середина нормы тоже настройка', centreToSettings(live, 3.4).trochanter_center_mm, 3.4)
ok('сдвиг середины двигает все границы', rotationCuts(centreToSettings(live, 3.4))[2] > rotationCuts(live)[2])

/* Снимки для сетки — настоящие исследования с измеренным расстоянием. */
const frames = rotationFrames(DEMO_JOBS)
ok('снимки бедра нашлись', frames.length > 0)
ok('у каждого измерено расстояние', frames.every((frame) => typeof frame.value === 'number'))
ok('у каждого есть контур измеренной области', frames.every((frame) => frame.regions.length > 0))
ok('контур лежит внутри кадра', frames.every((frame) =>
  frame.regions.every((region) => region.every(([x, y]) => x >= 0 && y >= 0 && x <= frame.cols && y <= frame.rows)),
))
ok('у каждого есть снимок, который можно запросить', frames.every((frame) => !!frame.dicomId))

const spread = (settings: typeof live) => {
  const count = { norm: 0, warn: 0, viol: 0 }
  for (const frame of frames) count[rotationBand(settings, frame.value)] += 1
  return count
}
eq('распределение сходится с числом снимков', Object.values(spread(live)).reduce((a, b) => a + b, 0), frames.length)
ok('сдвиг границы меняет распределение', spread(centreToSettings(live, 6)).norm !== spread(live).norm)

/* ---------- 4б. модели, которые крутит сервис ---------- */

const models = modelsOf(DEMO_JOBS)
eq('моделей пять, как в контракте', models.length, 5)
eq('имена из контракта', models.map((model) => model.id).sort(), [
  'foreign_seg', 'hip_keypoints', 'pelvis_crest', 'pelvis_presence', 'region',
])
ok('все подключены', models.every((model) => model.connected))

/* ---------- 5. экраны: что видит врач ---------- */

/* Экраны смотрим на свежей установке: выше состояние уже покрутили. */
annotStore.reset()

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
client.setQueryData(['annot', 'queue'], { queue: annotStore.queue() })
client.setQueryData(['annot', 'training'], {
  targets: annotStore.targets(),
  versions: annotStore.versions(),
})
/* Экран параметров и список моделей читают настоящий разбор снимков. */
client.setQueryData(['jobs', 50, 0], DEMO_JOBS)
for (const item of ANNOT_CASES) client.setQueryData(['annot', 'case', item.key], item)

/* Второй клиент: очередь из одного снимка бедра с предварительной разметкой —
   чтобы посмотреть на карточку точек и на все три состояния точки. */
const pointsClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const pointsQueue = annotStore
  .queue()
  .filter((item) => item.key === 'hip_right')
  .map((item) => ({ ...item, pre: true }))
pointsClient.setQueryData(['annot', 'queue'], { queue: pointsQueue })
for (const item of ANNOT_CASES) pointsClient.setQueryData(['annot', 'case', item.key], item)

const drawWith = (client: QueryClient, node: React.ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter>
          <AnnotProvider>{node}</AnnotProvider>
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )

const draw = (node: React.ReactNode) => drawWith(client, node)

const screens: Array<[string, string]> = [
  ['Очередь заданий', draw(<AnnotQueueWidget />)],
  ['Разметка снимка', draw(<AnnotDeskWidget />)],
  ['Дообучение модели', draw(<TrainWidget />)],
  ['Подбор параметров', draw(<TuneWidget />)],
  ['Разметка снимка · точки', drawWith(pointsClient, <AnnotDeskWidget />)],
]

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')

for (const [name, html] of screens) {
  ok(`${name}: экран нарисован`, html.length > 500, `${html.length} символов`)
  ok(`${name}: нет undefined`, !html.includes('undefined'))
  ok(`${name}: нет NaN`, !/\bNaN\b/.test(html))
}

/* словарь интерфейса из ретро: чего на экране быть не должно */
const BANNED: Array<[RegExp, string]> = [
  [/\bпрограмм/i, 'программа — только «модель»'],
  [/\bбугор|бугра|бугре/i, 'бугор — только «малый вертел»'],
  [/\bбрак[а-я]*\s+(укладки|снимка модели)/i, 'брак — только «нарушение»'],
  [/эталон/i, 'эталона на проде нет'],
  [/датасет/i, 'датасета на проде нет'],
  [/\bпорог/i, 'порогов на экране нет'],
  [/\bэпох/i, 'эпох обучения на экране нет'],
  [/\bметрик/i, 'метрик обучения на экране нет'],
  [/allowed_box|keypoints|presence|prefill|origin\b/i, 'имена из контракта'],
  [/\bjson\b/i, 'JSON на экране нет'],
  [/не уверена/i, 'женский род — только «сомневаюсь»'],
  [/лишние тревоги/i, 'формулировка убрана совсем'],
  [/рабочий стол разметчика/i, 'экран называется «Разметка снимка»'],
  [/dxa-qc|\b0\.4\.2\b/i, 'названия и версии моделей'],
]

for (const [name, html] of screens) {
  const body = text(html)
  for (const [pattern, why] of BANNED) {
    const hit = body.match(pattern)
    ok(`${name}: ${why}`, !hit, hit ? `найдено «${hit[0]}»` : '')
  }
}

/* и что нужные слова на месте */
const all = screens.map(([, html]) => text(html)).join(' ')
for (const word of ['норма', 'сомнение', 'нарушение', 'малый вертел', 'модел']) {
  ok(`словарь: «${word}» на экранах есть`, all.includes(word))
}

const desk = text(screens[1][1])
for (const word of ['Готово, следующий', 'сомневаюсь', 'пропустить', 'Особенности снимка']) {
  ok(`разметка: «${word}»`, desk.includes(word))
}
ok('разметка: место в очереди напечатано', /\d+ из \d+/.test(desk))

/* первый в очереди — снимок с предметом: у него карточка предметов, не точек */
for (const word of ['Посторонние предметы', 'обвести', 'Снимок чистый', 'обводить можно в любой части снимка']) {
  ok(`разметка предметов: «${word}»`, desk.includes(word))
}
ok('разметка предметов: обведённое перечислено', desk.includes('Обведено на снимке'))
ok('разметка: демо-переключателей снимков нет', !desk.includes('без подсказок'))
ok('разметка: одного снимка достаточно', !desk.includes('с предварительной разметкой м'))
ok('разметка предметов: точек нет', !desk.includes('Точки на снимке'))

const points = text(screens[4][1])
for (const word of ['Точки на снимке', 'нет на снимке', 'Верхушка большого вертела', 'точка встанет туда']) {
  ok(`разметка точек: «${word}»`, points.includes(word))
}
ok('разметка точек: сказано, что точка ставится кликом', points.includes('Кликните по кости'))
/* три состояния точки читаются на экране */
for (const word of ['готово', 'проверьте']) {
  ok(`разметка точек: состояние «${word}»`, points.includes(word))
}

const tune = text(screens[3][1])
for (const word of ['норма:', 'сомнение:', 'нарушение:', 'Сохранить', 'Вернуть прежние']) {
  ok(`параметры: «${word}»`, tune.includes(word))
}
ok('параметры: совпадения не считаются', !/совпад/i.test(tune))
ok('параметры: меток нет', !/\bметк[аи]\b/i.test(tune))

const train = text(screens[2][1])
for (const word of ['Разница', 'Дообучить выбранные', 'Перевести выбранные', 'можно дообучать']) {
  ok(`дообучение: «${word}»`, train.includes(word))
}

/* ---------- итог ---------- */

console.log(`\nпроверок пройдено: ${passed}`)
if (failures.length) {
  console.log(`не прошло: ${failures.length}`)
  for (const line of failures) console.log('  ✕ ' + line)
  process.exit(1)
}
console.log('всё сходится')
