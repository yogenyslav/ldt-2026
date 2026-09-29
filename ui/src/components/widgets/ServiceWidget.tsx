import { Cpu, ListTree } from 'lucide-react'
import Card, { CardBody, CardFoot, CardHead } from '@/components/ui/card'
import Empty from '@/components/shared/Empty'
import Loader from '@/components/shared/Loader'
import StateIcon from '@/components/shared/StateIcon'
import { ANALYSIS_METHOD, CRITERIA, MODEL_NAME, SETTING_TEXT } from '@/constants'
import { useJobs } from '@/hooks/useJobs'
import { useCurrentUser, useOrgId } from '@/hooks/useUser'
import { methodsOf } from '@/lib/criteria'
import { nm } from '@/lib/utils'

const Cell = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-surface px-4.5 py-3.5">
    <div className="text-[13.5px] text-muted">{label}</div>
    <div className="mt-0.5 base-semibold">{value}</div>
  </div>
)

const ServiceWidget = () => {
  const { data: user, isLoading } = useCurrentUser()
  const { data: jobs } = useJobs()
  const orgId = useOrgId()

  if (isLoading) return <Loader />

  /* Model list and thresholds arrive in the metadata of any processed job. */
  const withMeta = (jobs ?? []).find((job) => job.metadata?.models)
  const models = withMeta?.metadata?.models ?? {}
  const settings = withMeta?.metadata?.settings ?? {}

  /* Every criterion the service has actually returned lately, each with the
     `source` qc_prototype attaches to it (math / model / vote / heuristic /
     none) — read straight off the data, not guessed. Known criteria first, in
     the order the rest of the app names them; anything the ML side adds later
     still shows up, just at the end. */
  const methods = methodsOf(jobs)
  const methodKeys = [
    ...Object.keys(CRITERIA).filter((key) => methods[key]),
    ...Object.keys(methods).filter((key) => !CRITERIA[key]),
  ]

  return (
    <>
      <div className="mb-5.5 flex items-center gap-3.5">
        <h1 className="h1-bold">Служебное</h1>
        <span className="small-regular text-muted">учётная запись и состояние моделей</span>
      </div>

      <Card className="mb-5" mark>
        <CardHead>
          <ListTree size={20} className="text-brand" />
          <span className="h3-bold flex-1">Способы анализа</span>
          <span className="text-[13.5px] text-muted">что чем проверяется</span>
        </CardHead>

        {methodKeys.length ? (
          <div className="pb-1">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="[&>th]:border-b [&>th]:border-line-2 [&>th]:px-5 [&>th]:py-2.5 [&>th]:text-left [&>th]:text-[12.5px] [&>th]:font-semibold [&>th]:whitespace-nowrap [&>th]:text-muted">
                  <th>Критерий</th>
                  <th>Норма</th>
                  <th>Способ оценки</th>
                  <th>Задействованная модель</th>
                </tr>
              </thead>
              <tbody>
                {methodKeys.map((key) => {
                  const criterion = methods[key]
                  const source = criterion.source ?? 'none'
                  const linkedModel = models[key] !== undefined ? key : null
                  const connected = linkedModel ? String(models[linkedModel]).startsWith('подключ') : false

                  return (
                    <tr
                      key={key}
                      className="[&>td]:border-b [&>td]:border-line [&>td]:px-5 [&>td]:py-3 last:[&>td]:border-b-0"
                    >
                      <td className="base-semibold whitespace-nowrap">{CRITERIA[key]?.name ?? key}</td>
                      <td className="text-[13.5px] text-muted whitespace-nowrap">
                        {CRITERIA[key]?.norm ?? '—'}
                      </td>
                      <td>
                        <span
                          className={
                            source === 'model' || source === 'vote' ? 'base-semibold text-brand-700' : ''
                          }
                        >
                          {ANALYSIS_METHOD[source] ?? source}
                        </span>
                      </td>
                      <td>
                        {linkedModel ? (
                          <span className="inline-flex items-center gap-2">
                            <StateIcon level={connected ? 'ok' : ''} size="sm" />
                            {MODEL_NAME[linkedModel] ?? linkedModel}
                          </span>
                        ) : (
                          <span className="text-muted">—</span>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            icon={<ListTree size={22} />}
            title="Способы анализа пока не известны"
            text="Каждый критерий приходит с результатом разбора вместе с тем, как он был оценён. Таблица появится после первого обработанного снимка."
          />
        )}
      </Card>

      <div className="grid grid-cols-[minmax(360px,1fr)_minmax(470px,560px)] items-start gap-5">
        <Card>
          <CardHead>
            <span className="h3-bold">Учётная запись</span>
          </CardHead>
          <div className="grid grid-cols-2 gap-px bg-line">
            <Cell label="Специалист" value={user?.full_name ?? '—'} />
            <Cell
              label="Роль"
              value={user?.role === 'admin' ? 'Врач-рентгенолог' : 'Рентгенолаборант'}
            />
            {/* The organisation table has a name, but no endpoint exposes it:
                only the id arrives — context/backend_requests.md */}
            <Cell label="Организация" value={orgId ? `№ ${orgId}` : '—'} />
            <Cell label="Идентификатор" value={String(user?.id ?? '—')} />
          </div>
        </Card>

        <Card mark>
          <CardHead>
            <Cpu size={20} className="text-brand" />
            <span className="h3-bold">Модели анализа</span>
          </CardHead>
          <CardBody className="pt-0">
            {Object.keys(models).length ? (
              Object.keys(models).map((key) => {
                const connected = String(models[key]).startsWith('подключ')
                return (
                  <div
                    key={key}
                    className="flex items-center gap-3 border-t border-line py-3 first:border-t-0"
                  >
                    <StateIcon level={connected ? 'ok' : ''} size="sm" />
                    <span className="flex-1 base-semibold">{MODEL_NAME[key] ?? key}</span>
                    <span className="small-regular text-muted">{models[key]}</span>
                  </div>
                )
              })
            ) : (
              <p className="m-0 base-regular text-muted">
                Состав моделей приходит в результате обработки. Он появится здесь после первого
                обработанного снимка.
              </p>
            )}
          </CardBody>
          {Object.keys(settings).length ? (
            <CardFoot className="bg-surface-2">
              <span className="small-regular text-muted">
                Пороги:{' '}
                {Object.keys(settings)
                  .map((key) => SETTING_TEXT[key]?.(nm(settings[key])) ?? `${key} ${nm(settings[key])}`)
                  .join(' · ')}
              </span>
            </CardFoot>
          ) : null}
        </Card>
      </div>
    </>
  )
}

export default ServiceWidget
