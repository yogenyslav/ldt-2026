import { useMemo } from 'react'
import Card, { CardBody, CardFoot, CardHead } from '@/components/ui/card'
import { useJobs } from '@/hooks/useJobs'
import { criteriaRows } from '@/lib/criteria'
import { nm, plural } from '@/lib/utils'
import { verdictOf } from '@/lib/verdict'
import type { IJobInfo } from '@/types'

/* Statistics of the room. The backend has no aggregates, so everything here is
   counted on the client over the page of jobs that has been loaded — and it is
   not filtered by organisation yet either, because the queue is not.
   Both points are in context/backend_requests.md; until they are done the
   numbers are labelled with what they actually cover. */

const Tile = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
  <div className="rounded-soft border border-line bg-surface px-4 py-3.5">
    <div className="text-[13px] text-muted">{label}</div>
    <div
      className={
        'tabular mt-1 text-[24px] leading-none font-bold tracking-[-0.02em] ' +
        (tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : '')
      }
    >
      {value}
    </div>
  </div>
)

function summarise(jobs: IJobInfo[]) {
  const done = jobs.filter((job) => job.status === 'completed')
  const levels = done.map(verdictOf)

  /* Which criteria fail most often: the one number that changes how the
     technologist positions the next patient. */
  const faults = new Map<string, number>()
  for (const job of done) {
    for (const row of criteriaRows(job)) {
      if (row.level !== 'bad' && row.level !== 'warn') continue
      faults.set(row.name, (faults.get(row.name) ?? 0) + 1)
    }
  }

  const durations = done.map((job) => job.duration_ms ?? 0).filter(Boolean)

  return {
    total: jobs.length,
    ok: levels.filter((level) => level === 'ok').length,
    warn: levels.filter((level) => level === 'warn').length,
    bad: levels.filter((level) => level === 'bad').length,
    failed: jobs.filter((job) => job.status === 'failed').length,
    retakes: jobs.filter((job) => job.specialist_decision === 'rejected').length,
    average: durations.length
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length / 1000
      : null,
    faults: [...faults.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
  }
}

const StatsCard = () => {
  const { data: jobs } = useJobs(200)

  const today = new Date().toISOString().slice(0, 10)
  const stats = useMemo(
    () => summarise((jobs ?? []).filter((job) => job.created_at.startsWith(today))),
    [jobs, today],
  )

  return (
    <Card>
      <CardHead>
        <span className="h3-bold">Статистика кабинета</span>
        <span className="flex-1" />
        <span className="small-regular text-muted">за сегодня</span>
      </CardHead>

      <CardBody className="pt-0">
        <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-3">
          <Tile label="Снимков" value={String(stats.total)} />
          <Tile label="Корректных" value={String(stats.ok)} tone="ok" />
          <Tile label="Нужен взгляд" value={String(stats.warn)} tone={stats.warn ? 'warn' : undefined} />
          <Tile label="К пересъёмке" value={String(stats.bad)} tone={stats.bad ? 'bad' : undefined} />
          <Tile label="Переснято" value={String(stats.retakes)} />
          <Tile
            label="Обработка"
            value={stats.average === null ? '—' : `${nm(stats.average)} с`}
          />
        </div>

        {stats.faults.length ? (
          <>
            <div className="mt-5 mb-2.5 base-semibold">Чаще всего мешает</div>
            <div className="flex flex-col">
              {stats.faults.map(([name, count]) => (
                <div
                  key={name}
                  className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0"
                >
                  <span className="flex-1 base-regular">{name}</span>
                  <span className="tabular small-regular text-muted">
                    {count} {plural(count, 'снимок', 'снимка', 'снимков')}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <p className="mt-4 mb-0 base-regular text-muted">
            Замечаний по укладке за сегодня нет.
          </p>
        )}
      </CardBody>

      <CardFoot className="bg-surface-2">
        <span className="small-regular text-muted">
          Считается по загруженной странице очереди. Пока бекенд не отдаёт выборку по организации,
          сюда попадают и снимки других кабинетов сети.
        </span>
      </CardFoot>
    </Card>
  )
}

export default StatsCard
