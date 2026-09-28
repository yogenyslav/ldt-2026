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
  toggleAnswer,
  withAnswers,
} from '@/lib/annotation'
import { cutLabel, delta, positionOf, setCut, spread, statusOf } from '@/lib/tune'

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
const answered = (...steps: Array<[number, 'confirmed' | 'absent']>) => {
  let map = {}
  for (const [index, value] of steps) map = toggleAnswer(map, index, value)
  return withAnswers(hipRight, map)
}

const confirmed = answered([1, 'confirmed'])
eq('«всё верно» закрывает точку', pointState(confirmed, 1), 'checked')
eq('после «всё верно» конвейер идёт дальше', nextPoint(confirmed, 1), 2)
const absent = answered([1, 'absent'])
eq('«нет на снимке» ставит своё состояние', pointState(absent, 1), 'absent')
eq('повторное «нет на снимке» снимает ответ', pointState(answered([1, 'absent'], [1, 'absent']), 1), 'suggested')
ok('исходный снимок по-прежнему не тронут', pointStates(hipRight)[1] === 'suggested')
const done = answered([1, 'confirmed'], [2, 'confirmed'])
eq('когда отмечать нечего, точка остаётся в руке', nextPoint(done, 2), 2)
eq('снимок закрыт', leftToMark(done), 0)

/* ---------- 2. очередь и место в ней ---------- */

const queue = annotStore.queue()
eq('очередь целиком', queueKeys(queue, 'all').length, 5)
eq('из поликлиник', queueKeys(queue, 'clinic'), ['spine_foreign', 'hip_left', 'spine_ok'])
eq('загруженные', queueKeys(queue, 'upload'), ['spine_bad', 'hip_right'])
eq('место в отфильтрованной очереди', placeInQueue(queueKeys(queue, 'clinic'), 'hip_left', 41), '2 из 41')
eq('следующий идёт по той же очереди', nextKey(queueKeys(queue, 'clinic'), 'hip_left'), 'spine_ok')
eq('после последнего следующего нет', nextKey(queueKeys(queue, 'clinic'), 'spine_ok'), null)

/* отправленный снимок уходит из очереди и из счётчика */
const totalBefore = annotStore.total()
annotStore.finish('hip_left')
eq('отправленный снимок ушёл из очереди', queueKeys(annotStore.queue(), 'all').includes('hip_left'), false)
eq('счётчик поликлиник уменьшился', annotStore.total().clinic, totalBefore.clinic - 1)
eq('счётчик загруженных не тронут', annotStore.total().upload, totalBefore.upload)
annotStore.add(12, false)
eq('добавленные снимки попали в счётчик', annotStore.total().upload, totalBefore.upload + 12)

/* ---------- 3. дообучение ---------- */

eq('обучается одна модель', annotStore.targets().filter((t) => t.busy).length, 1)
annotStore.train(['crest'])
eq('после запуска обучаются две', annotStore.targets().filter((t) => t.busy).length, 2)
eq('новых версий две', annotStore.versions().length, 2)
annotStore.switchOver(['crest'])
eq('переведённая версия больше не новая', annotStore.versions().map((v) => v.id), ['foreign'])

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

/* ---------- 4. подбор параметров ---------- */

const rotation = annotStore.params().find((item) => item.id === 'rotation')!
const crest = annotStore.params().find((item) => item.id === 'crest')!

eq('полос на одну больше, чем границ', rotation.bands.length, rotation.cuts.length + 1)
eq('у гребня одна граница и две полосы', [crest.cuts.length, crest.bands.length], [1, 2])
eq('ниже первой границы — нарушение', statusOf(rotation, 0.1), 'viol')
eq('между первой и второй — сомнение', statusOf(rotation, 0.5), 'warn')
eq('в середине — норма', statusOf(rotation, 2.5), 'norm')
eq('за последней границей — нарушение', statusOf(rotation, 7), 'viol')
eq('ровно на границе — уже следующая полоса', statusOf(rotation, 0.2), 'warn')

const shots = annotStore.shots('rotation')
eq('снимков для ротации', shots.length, 16)
ok('у каждого снимка есть контур', shots.every((shot) => shot.shapes.length > 0))
ok('контур лежит внутри кадра', shots.every((shot) =>
  shot.shapes.every((shape) => shape.every(([x, y]) => x >= 0 && y >= 0 && x <= shot.cols && y <= shot.rows)),
))
const counted = spread(rotation, shots.map((shot) => shot.value))
eq('распределение сходится с числом снимков', counted.norm + counted.warn + counted.viol, shots.length)

const wider = { ...rotation, cuts: setCut(rotation, 2, 8) }
eq('граница не перепрыгивает соседа', wider.cuts[2] <= wider.cuts[3] - rotation.step + 1e-9, true)
eq('границы остались по возрастанию', wider.cuts.every((cut, i) => i === 0 || cut >= wider.cuts[i - 1]), true)
eq('граница не уходит ниже начала шкалы', setCut(rotation, 0, -5)[0], rotation.min)
eq('шаг округляется', setCut(rotation, 0, 0.17)[0], 0.2)
const moved = spread({ ...rotation, cuts: setCut(rotation, 2, 1.5) }, shots.map((s) => s.value))
ok('сдвиг границы меняет распределение', moved.norm !== counted.norm)

const crestShots = annotStore.shots('crest')
eq('снимков для гребня', crestShots.length, 16)
ok('у гребня по два окна на снимке', crestShots.every((shot) => shot.shapes.length === 2))

eq('подпись границы по-русски', cutLabel(rotation, 1.0), '1,0')
eq('целая шкала без запятой', cutLabel(crest, 70), '70')
eq('начало шкалы — ноль процентов', positionOf(rotation, rotation.min), 0)
eq('конец шкалы — сто процентов', positionOf(rotation, rotation.max), 100)

annotStore.saveCuts('rotation', [0.3, 1.2, 4, 5])
eq('сохранённые границы возвращаются', annotStore.params().find((p) => p.id === 'rotation')!.cuts, [
  0.3, 1.2, 4, 5,
])

/* ---------- 5. экраны: что видит врач ---------- */

/* Экраны смотрим на свежей установке: выше состояние уже покрутили. */
annotStore.reset()

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
client.setQueryData(['annot', 'queue'], {
  queue: annotStore.queue(),
  total: annotStore.total(),
  tiles: annotStore.tiles(),
})
client.setQueryData(['annot', 'training'], {
  targets: annotStore.targets(),
  versions: annotStore.versions(),
})
client.setQueryData(['annot', 'params'], annotStore.params())
client.setQueryData(['annot', 'shots', 'rotation', 'clinic'], annotStore.shots('rotation'))
for (const item of ANNOT_CASES) client.setQueryData(['annot', 'case', item.key], item)

/* Второй клиент: очередь из одного снимка бедра с предварительной разметкой —
   чтобы посмотреть на карточку точек и на все три состояния точки. */
const pointsClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const pointsQueue = annotStore
  .queue()
  .filter((item) => item.key === 'hip_right')
  .map((item) => ({ ...item, pre: true }))
pointsClient.setQueryData(['annot', 'queue'], {
  queue: pointsQueue,
  total: annotStore.total(),
  tiles: annotStore.tiles(),
})
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
ok('разметка предметов: точек нет', !desk.includes('Точки на снимке'))

const points = text(screens[4][1])
for (const word of ['Точки на снимке', 'нет на снимке', 'Верхушка большого вертела', 'подсвечена область']) {
  ok(`разметка точек: «${word}»`, points.includes(word))
}
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
