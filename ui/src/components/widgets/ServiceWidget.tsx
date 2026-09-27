import Card, { CardBody, CardFoot, CardHead } from '@/components/ui/card'
import Loader from '@/components/shared/Loader'
import StateIcon from '@/components/shared/StateIcon'
import { MODEL_NAME, SETTING_TEXT } from '@/constants'
import { useJobs } from '@/hooks/useJobs'
import { useCurrentUser } from '@/hooks/useUser'
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

  if (isLoading) return <Loader />

  /* Model list and thresholds arrive in the metadata of any processed job. */
  const withMeta = (jobs ?? []).find((job) => job.metadata?.models)
  const models = withMeta?.metadata?.models ?? {}
  const settings = withMeta?.metadata?.settings ?? {}

  return (
    <>
      <div className="mb-5.5 flex items-center gap-3.5">
        <h1 className="h1-bold">Служебное</h1>
        <span className="small-regular text-muted">учётная запись и состояние моделей</span>
      </div>

      <div className="grid grid-cols-[minmax(360px,1fr)_minmax(470px,560px)] items-start gap-5">
        <Card>
          <CardHead>
            <span className="h3-bold">Учётная запись</span>
          </CardHead>
          <div className="grid grid-cols-2 gap-px bg-line">
            <Cell label="Специалист" value={user?.full_name ?? '—'} />
            <Cell label="Роль" value={user?.role === 'admin' ? 'Врач-рентгенолог' : 'Рентгенолаборант'} />
            <Cell label="Организация" value="Центр диагностики и телемедицины" />
            <Cell label="Идентификатор" value={String(user?.id ?? '—')} />
          </div>
        </Card>

        <Card>
          <CardHead>
            <span className="h3-bold">Модели анализа</span>
            <span className="flex-1" />
            <span className="tabular small-regular text-muted">dxa-qc 0.4.2</span>
          </CardHead>
          <CardBody className="pt-0">
            {Object.keys(models).map((key) => {
              const connected = String(models[key]).startsWith('подключ')
              return (
                <div key={key} className="flex items-center gap-3 border-t border-line py-3 first:border-t-0">
                  <StateIcon level={connected ? 'ok' : ''} size="sm" />
                  <span className="flex-1 base-semibold">{MODEL_NAME[key] ?? key}</span>
                  <span className="small-regular text-muted">{models[key]}</span>
                </div>
              )
            })}
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
