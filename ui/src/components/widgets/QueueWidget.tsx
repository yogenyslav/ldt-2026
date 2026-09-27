import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, FileText, Search, X } from 'lucide-react'
import Button from '@/components/ui/button'
import Card from '@/components/ui/card'
import Empty from '@/components/shared/Empty'
import Loader from '@/components/shared/Loader'
import VerdictBadge from '@/components/shared/VerdictBadge'
import ZoneChip from '@/components/shared/ZoneChip'
import { useToast } from '@/components/ui/toast'
import { useDecideJob, useJobs } from '@/hooks/useJobs'
import { useGenerateReport } from '@/hooks/useReports'
import { cn, plural, whenOf } from '@/lib/utils'
import { groupByStudy, studyVerdict, verdictOf } from '@/lib/verdict'
import type { Decision, IJobInfo, VerdictKind } from '@/types'

const COLUMNS = 'grid grid-cols-[44px_128px_146px_1fr_236px_116px_24px] items-center gap-3.5'

interface IFilters {
  region: string
  verdict: string
  decision: string
  query: string
}

const Select = ({
  value,
  onChange,
  options,
}: {
  value: string
  onChange: (value: string) => void
  options: Array<[string, string]>
}) => (
  <select
    value={value}
    onChange={(event) => onChange(event.target.value)}
    className="h-11 cursor-pointer appearance-none rounded-control border border-line-2 bg-surface bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%230b63e5%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[position:right_14px_center] bg-no-repeat pr-9 pl-4 text-[14.5px] text-ink"
  >
    {options.map(([key, label]) => (
      <option key={key} value={key}>
        {label}
      </option>
    ))}
  </select>
)

const QueueWidget = () => {
  const { data: jobs, isLoading } = useJobs()
  const decide = useDecideJob()
  const generate = useGenerateReport()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [filters, setFilters] = useState<IFilters>({
    region: '',
    verdict: '',
    decision: '',
    query: '',
  })
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [limit, setLimit] = useState(8)

  const visible = useMemo(() => {
    return (jobs ?? []).filter((job) => {
      const level = verdictOf(job)
      if (filters.region && job.anatomical_region !== filters.region) return false
      if (filters.verdict && level !== filters.verdict) return false
      if (filters.decision === '_none' && job.specialist_decision) return false
      if (filters.decision && filters.decision !== '_none' && job.specialist_decision !== filters.decision) {
        return false
      }
      if (filters.query) {
        const needle = filters.query.toLowerCase()
        const haystack = `${job.id} ${job.patient_ref ?? ''}`.toLowerCase()
        if (!haystack.includes(needle)) return false
      }
      return true
    })
  }, [jobs, filters])

  const studies = useMemo(() => groupByStudy(visible), [visible])
  const shown = studies.slice(0, limit)
  const selected = Object.keys(picked).filter((key) => picked[key])

  const selectedJobs = () =>
    studies
      .filter((study) => picked[study.study_id])
      .flatMap((study) => study.jobs)
      .filter((job) => job.status === 'completed')

  const applyDecision = async (decision: Decision) => {
    const jobIds = selectedJobs().map((job) => job.id)
    if (!jobIds.length) return
    await decide.mutateAsync({ jobIds, decision })
    setPicked({})
    toast({ title: `Решение принято по ${jobIds.length} ${plural(jobIds.length, 'снимку', 'снимкам', 'снимкам')}` })
  }

  const makeReport = async () => {
    const jobIds = selectedJobs().map((job) => job.id)
    if (!jobIds.length) return
    const result = await generate.mutateAsync(jobIds)
    setPicked({})
    toast({ title: `Отчёт № ${result.report_id} сформирован` })
  }

  if (isLoading) return <Loader />

  return (
    <>
      <div className="mb-5.5 flex items-center gap-3.5">
        <h1 className="h1-bold">Очередь исследований</h1>
        <span className="small-regular text-muted">
          {studies.length} {plural(studies.length, 'посещение', 'посещения', 'посещений')},{' '}
          {visible.length} {plural(visible.length, 'снимок', 'снимка', 'снимков')}
        </span>
      </div>

      <div className="mb-4.5 flex flex-wrap items-center gap-2.5">
        <Select
          value={filters.region}
          onChange={(region) => setFilters({ ...filters, region })}
          options={[
            ['', 'Все области'],
            ['spine', 'Позвоночник'],
            ['hip_left', 'Левое бедро'],
            ['hip_right', 'Правое бедро'],
          ]}
        />
        <Select
          value={filters.verdict}
          onChange={(verdict) => setFilters({ ...filters, verdict })}
          options={[
            ['', 'Любой вердикт'],
            ['ok', 'Корректно'],
            ['warn', 'Нужен взгляд специалиста'],
            ['bad', 'Переснять'],
            ['wait', 'В обработке'],
            ['failed', 'Ошибка'],
          ]}
        />
        <Select
          value={filters.decision}
          onChange={(decision) => setFilters({ ...filters, decision })}
          options={[
            ['', 'Любое решение'],
            ['_none', 'Не разобрано'],
            ['approved', 'Принято'],
            ['rejected', 'Отклонено'],
            ['force_approved', 'Принято вопреки'],
          ]}
        />
        <span className="flex h-11 items-center gap-2.5 rounded-control border border-line-2 bg-surface px-4 text-brand">
          <Search size={16} />
          <input
            className="w-[210px] border-none bg-transparent text-[14.5px] text-ink outline-none placeholder:text-muted"
            placeholder="пациент или номер задачи"
            value={filters.query}
            onChange={(event) => setFilters({ ...filters, query: event.target.value })}
          />
        </span>
      </div>

      {selected.length ? (
        <div className="mb-4.5 flex items-center gap-3 rounded-panel border border-brand-100 bg-brand-050 px-4 py-3 small-regular">
          <span>
            Выбрано <b className="tabular">{selected.length}</b>
          </span>
          <Button onClick={() => applyDecision('approved')}>
            <Check size={16} />
            Принять
          </Button>
          <Button onClick={() => applyDecision('rejected')}>
            <X size={16} />
            Отклонить
          </Button>
          <Button onClick={makeReport}>
            <FileText size={16} />
            Сформировать отчёт
          </Button>
          <span className="flex-1" />
          <Button variant="quiet" onClick={() => setPicked({})}>
            Снять выделение
          </Button>
        </div>
      ) : null}

      <div className={cn(COLUMNS, 'px-5 pb-2 text-[13.5px] text-muted')}>
        <span />
        <span>Поступило</span>
        <span>Пациент</span>
        <span>Зоны исследования</span>
        <span>Вердикт</span>
        <span>Решение</span>
        <span />
      </div>

      {shown.length ? (
        <div className="overflow-hidden rounded-panel bg-surface shadow-card">
          {shown.map((study) => {
            const level: VerdictKind = studyVerdict(study)
            const decided = study.jobs.filter((job) => job.specialist_decision).length
            const decision =
              decided === study.jobs.length
                ? 'разобрано'
                : decided
                  ? `${decided} из ${study.jobs.length}`
                  : 'не разобрано'

            const open = (job?: IJobInfo) => navigate(`/study/${(job ?? study.jobs[0]).id}`)

            return (
              <div
                key={study.study_id}
                onClick={() => open()}
                className={cn(
                  COLUMNS,
                  'group cursor-pointer border-b border-line px-5 py-3.5 transition-colors last:border-b-0',
                  'hover:bg-brand-050 hover:ring-[1.5px] hover:ring-brand-400 hover:ring-inset',
                  picked[study.study_id] && 'bg-brand-050 ring-[1.5px] ring-brand ring-inset',
                )}
              >
                <label className="flex-center cursor-pointer" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    className="h-[18px] w-[18px] cursor-pointer accent-brand"
                    checked={!!picked[study.study_id]}
                    onChange={() =>
                      setPicked((current) => ({
                        ...current,
                        [study.study_id]: !current[study.study_id],
                      }))
                    }
                  />
                </label>

                <div className="tabular small-regular whitespace-nowrap text-ink-2">
                  {whenOf(study.created_at)}
                </div>

                <div className="base-semibold">
                  {study.patient_ref ?? '—'}
                  <span className="block small-regular font-normal text-muted">
                    {study.jobs.length} {plural(study.jobs.length, 'снимок', 'снимка', 'снимков')}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {study.jobs.slice(0, 3).map((job) => (
                    <ZoneChip
                      key={job.id}
                      job={job}
                      onClick={(event) => {
                        event.stopPropagation()
                        open(job)
                      }}
                    />
                  ))}
                  {study.jobs.length > 3 ? (
                    <span className="inline-flex h-[30px] items-center rounded-full bg-dead-bg px-3 text-[13.5px] font-medium text-dead">
                      ещё {study.jobs.length - 3}
                    </span>
                  ) : null}
                </div>

                <div>
                  <VerdictBadge level={level} />
                </div>

                <div className="small-regular text-ink-2">{decision}</div>

                <ChevronRight size={20} className="text-line-2 group-hover:text-brand" />
              </div>
            )
          })}
        </div>
      ) : (
        <Card>
          <Empty
            icon={<Search size={22} />}
            title="Ничего не найдено"
            text="Измените фильтры или загрузите следующую страницу."
          />
        </Card>
      )}

      <div className="flex items-center gap-3 px-1 pt-3.5 small-regular text-muted">
        <span>
          Показано {shown.length} из {studies.length}
        </span>
        {shown.length < studies.length ? (
          <Button onClick={() => setLimit((value) => value + 8)}>Показать ещё</Button>
        ) : null}
      </div>
    </>
  )
}

export default QueueWidget
