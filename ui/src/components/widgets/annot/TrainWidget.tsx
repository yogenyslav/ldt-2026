import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '@/components/ui/button'
import Card, { CardBody, CardFoot, CardHead } from '@/components/ui/card'
import Check from '@/components/ui/check'
import Tag from '@/components/ui/tag'
import Bar from '@/components/shared/Bar'
import Empty from '@/components/shared/Empty'
import WorkHead from '@/components/shared/WorkHead'
import { useToast } from '@/components/ui/toast'
import { useStartTraining, useSwitchVersions, useTraining } from '@/hooks/useAnnotation'
import { useJobs } from '@/hooks/useJobs'
import Modal from '@/components/ui/modal'
import { TRAINING_LOCKED } from '@/config'
import { MODEL_NAME } from '@/constants'
import { modelsOf } from '@/lib/settings'
import { delta } from '@/lib/tune'
import { BrainCircuit } from 'lucide-react'

/* ============================================================
   Дообучение модели.

   The four models are independent: each is trained on its own
   answers and each is switched over on its own. So both lists are
   checkboxes — nothing here is all-or-nothing.

   The right-hand column is the difference between the two versions
   and its sign, not a word about which is better: every number
   carries the direction it should move (lib/tune.ts), and there is
   nothing in the product that could hand out an opinion.
   ============================================================ */

const TONE: Record<string, string> = { ok: 'ok', bad: 'bad', dead: 'dead' }

const picked = (map: Record<string, boolean>) => Object.keys(map).filter((key) => map[key])

const TrainWidget = () => {
  const { data, isError } = useTraining()
  const { data: jobs } = useJobs()
  const start = useStartTraining()
  const change = useSwitchVersions()
  const { toast } = useToast()
  const [locked, setLocked] = useState(false)
  const navigate = useNavigate()

  const models = modelsOf(jobs)

  const [trainPick, setTrainPick] = useState<Record<string, boolean>>({ crest: true })
  const [versionPick, setVersionPick] = useState<Record<string, boolean>>({ crest: true })

  const targets = data?.targets ?? []
  const versions = data?.versions ?? []

  const toTrain = picked(trainPick).filter((id) =>
    targets.some((target) => target.id === id && target.ready && !target.busy),
  )
  const toSwitch = picked(versionPick).filter((id) => versions.some((version) => version.id === id))

  const busy = targets.filter((target) => target.busy)

  return (
    <>
      <Modal open={locked} title="Действие недоступно" onClose={() => setLocked(false)}>
        <div className="flex flex-col gap-4 p-5">
          <p className="m-0 base-regular">
            На тестовом стенде отключена возможность дообучать и заменять модели, чтобы не сбивать
            калибровку моделей.
          </p>
          <div>
            <Button variant="primary" onClick={() => setLocked(false)}>
              Понятно
            </Button>
          </div>
        </div>
      </Modal>
      <WorkHead
        title="Дообучение модели"
        sub="каждая модель обучается и обновляется отдельно"
        lead="Размеченные снимки идут в обучение. Выберите, что дообучать и на какие новые версии переходить — остальное останется как есть."
      />

      {/* What the service is running right now — straight out of the last
          result, not out of a list kept here. */}
      <Card className="mb-4.5">
        <CardHead>
          <h3 className="h3-bold flex-1">Модели в работе</h3>
          <span className="text-[13.5px] text-muted">по последнему разбору</span>
        </CardHead>
        <CardBody className="flex flex-wrap gap-2 pt-0">
          {models.length ? (
            models.map((model) => (
              <Tag key={model.id} tone={model.connected ? 'ok' : 'dead'}>
                {MODEL_NAME[model.id] ?? model.id}
                {model.connected ? '' : ` · ${model.status}`}
              </Tag>
            ))
          ) : (
            <span className="text-[13.5px] text-muted">
              Список появится после первого разбора снимка.
            </span>
          )}
        </CardBody>
      </Card>

      <Card className="mb-4.5" mark>
        <CardHead>
          <h3 className="h3-bold flex-1">Собрано для обучения</h3>
          <span className="text-[13.5px] text-muted">учитываются только проверенные снимки</span>
        </CardHead>

        <div className="pb-1">
          <table className="w-full border-collapse text-[14px]">
            <tbody>
              {targets.map((target) => {
                const percent = Math.min(100, Math.round((target.have / target.need) * 100))
                const pickable = target.ready && !target.busy

                return (
                  <tr
                    key={target.id}
                    onClick={() =>
                      pickable &&
                      setTrainPick((map) => ({ ...map, [target.id]: !map[target.id] }))
                    }
                    className={[
                      '[&>td]:border-b [&>td]:border-line [&>td]:px-3 [&>td]:py-2.5 last:[&>td]:border-b-0',
                      pickable ? 'cursor-pointer hover:bg-hover' : '',
                    ].join(' ')}
                  >
                    <td className="w-11.5">
                      {pickable ? <Check bare on={!!trainPick[target.id]} tabIndex={-1} /> : null}
                    </td>
                    <td>
                      <b>{target.name}</b>
                      <div className="text-[13.5px] text-muted">{target.hard}</div>
                    </td>
                    <td className="tabular">
                      {target.have} из {target.need}
                    </td>
                    <td className="w-50">
                      <Bar percent={percent} />
                    </td>
                    <td>
                      {target.busy ? (
                        <Tag tone="warn">обучается</Tag>
                      ) : target.ready ? (
                        <Tag tone="ok">можно дообучать</Tag>
                      ) : (
                        <Tag tone="dead">нужно ещё {target.need - target.have}</Tag>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <CardFoot>
          <Button
            variant="primary"
            disabled={!toTrain.length || start.isPending}
            onClick={async () => {
              if (TRAINING_LOCKED) return setLocked(true)
              await start.mutateAsync(toTrain)
              setTrainPick({})
              toast({ title: 'Дообучение запущено' })
            }}
          >
            Дообучить выбранные{toTrain.length ? ` (${toTrain.length})` : ''}
          </Button>
          <span className="flex-1" />
          {busy.map((target) => (
            <span key={target.id} className="text-[13.5px] text-muted">
              «{target.name}» сейчас обучаются
              {target.done !== undefined ? `: пройдено ${Math.round(target.done * 100)}%` : ''}
              {target.left_minutes !== undefined
                ? `, осталось около ${target.left_minutes} минут`
                : ''}
            </span>
          ))}
        </CardFoot>
      </Card>

      <Card>
        <CardHead>
          <h3 className="h3-bold flex-1">Новые версии</h3>
          <span className="text-[13.5px] text-muted">отметьте те, на которые переходим</span>
        </CardHead>

        {isError ? (
          <Empty
            icon={<BrainCircuit size={22} />}
            title="Не удалось получить состояние дообучения"
            text="Список моделей выше — из последнего разбора снимка. Сбор и новые версии появятся, когда сервис начнёт их отдавать."
          />
        ) : versions.length ? (
          <>
            <div className="pb-1">
              <table className="w-full border-collapse text-[14px]">
                <thead>
                  <tr className="[&>th]:border-b [&>th]:border-line-2 [&>th]:px-3 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[12.5px] [&>th]:font-semibold [&>th]:whitespace-nowrap [&>th]:text-muted">
                    <th />
                    <th>Показатель</th>
                    <th className="text-right!">Сейчас</th>
                    <th className="text-right!">Новая версия</th>
                    <th className="text-right!">Разница</th>
                  </tr>
                </thead>

                {versions.map((version) => (
                  <tbody key={version.id}>
                    <tr
                      onClick={() =>
                        setVersionPick((map) => ({ ...map, [version.id]: !map[version.id] }))
                      }
                      className="cursor-pointer bg-surface-2 hover:bg-hover [&>td]:px-3 [&>td]:pt-4 [&>td]:pb-2.5"
                    >
                      <td className="w-11.5">
                        <Check bare on={!!versionPick[version.id]} tabIndex={-1} />
                      </td>
                      <td>
                        <b>{version.name}</b>
                      </td>
                      <td colSpan={3} className="text-[13.5px] text-muted">
                        обучена {version.trained} · проверена на {version.checked} контрольных
                        снимках
                      </td>
                    </tr>

                    {version.metrics.map((metric) => {
                      const difference = delta(metric)
                      return (
                        <tr
                          key={metric.name}
                          className="[&>td]:border-b [&>td]:border-line [&>td]:px-3 [&>td]:py-2.5"
                        >
                          <td />
                          <td>{metric.name}</td>
                          <td className="text-right tabular">
                            {metric.now} {metric.unit}
                          </td>
                          <td className="text-right tabular">
                            <b>
                              {metric.next} {metric.unit}
                            </b>
                          </td>
                          <td className="text-right">
                            <Tag tone={TONE[difference.tone]}>{difference.text}</Tag>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                ))}
              </table>
            </div>

            <CardFoot>
              <Button
                variant="primary"
                disabled={!toSwitch.length || change.isPending}
                onClick={async () => {
                  if (TRAINING_LOCKED) return setLocked(true)
                  await change.mutateAsync(toSwitch)
                  setVersionPick({})
                  toast({ title: 'Модель переведена на новую версию' })
                }}
              >
                Перевести выбранные{toSwitch.length ? ` (${toSwitch.length})` : ''}
              </Button>
              {/* The frames the two versions disagree on are the ones worth
                  looking at by hand — they are in the annotation queue. */}
              <Button onClick={() => navigate('/markup')}>Посмотреть спорные снимки</Button>
            </CardFoot>
          </>
        ) : (
          <Empty
            icon={<BrainCircuit size={22} />}
            title="Новых версий нет"
            text="Появятся, когда закончится дообучение."
          />
        )}
      </Card>
    </>
  )
}

export default TrainWidget
