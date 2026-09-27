import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronLeft, X } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardBody, CardHead } from '@/components/ui/card'
import Textarea from '@/components/ui/textarea'
import Label from '@/components/ui/label'
import CriteriaList from '@/components/shared/CriteriaList'
import Loader from '@/components/shared/Loader'
import Picker from '@/components/shared/Picker'
import StateIcon from '@/components/shared/StateIcon'
import Steps from '@/components/shared/Steps'
import VerdictBadge from '@/components/shared/VerdictBadge'
import Viewer from '@/components/shared/Viewer'
import { useToast } from '@/components/ui/toast'
import { DECISION, REGION, STATUS } from '@/constants'
import { useDecideJob, useJob, useJobs } from '@/hooks/useJobs'
import { nm, whenOf } from '@/lib/utils'
import { groupByStudy, verdictOf } from '@/lib/verdict'
import type { Decision, IJobInfo } from '@/types'

const Cell = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-surface px-4.5 py-3.5">
    <div className="text-[13.5px] text-muted">{label}</div>
    <div className="mt-0.5 base-semibold">{value}</div>
  </div>
)

/* Utility line. Confidence is shown only here, with wording that keeps it
   from being read as confidence in the verdict. */
const QuietLine = ({ job }: { job: IJobInfo }) => {
  if (job.confidence === null || job.confidence === undefined) return null
  return (
    <div className="border-t border-line px-5 py-3.5 small-regular text-muted">
      Область определена с уверенностью{' '}
      <b className="tabular font-medium text-ink-2">{nm(job.confidence * 100, 0)}%</b>, обработка заняла{' '}
      <b className="tabular font-medium text-ink-2">{nm((job.duration_ms ?? 0) / 1000)} с</b>
    </div>
  )
}

const DecisionBlock = ({ job }: { job: IJobInfo }) => {
  const decide = useDecideJob()
  const { toast } = useToast()
  const [comment, setComment] = useState('')

  if (job.specialist_decision) {
    const level =
      job.specialist_decision === 'rejected' ? 'bad' : job.specialist_decision === 'force_approved' ? 'warn' : 'ok'
    return (
      <>
        <div className="flex items-start gap-3 rounded-soft border border-line bg-surface-2 px-4 py-3.5">
          <StateIcon level={level} />
          <div>
            <div className="base-semibold">{DECISION[job.specialist_decision]}</div>
            <div className="mt-0.5 small-regular text-muted">{job.specialist_name}</div>
            {job.comment ? (
              <div className="mt-2 border-l-2 border-line-2 pl-3 small-regular text-ink-2">{job.comment}</div>
            ) : null}
          </div>
        </div>
      </>
    )
  }

  if (job.status !== 'completed') {
    return <p className="base-regular text-muted">Решение можно принять после того, как задача обработана.</p>
  }

  const apply = async (decision: Decision) => {
    await decide.mutateAsync({ jobIds: [job.id], decision, comment })
    setComment('')
    toast({ title: DECISION[decision], variant: decision === 'rejected' ? 'destructive' : 'default' })
  }

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label htmlFor="comment">Комментарий (необязательно)</Label>
        <Textarea
          id="comment"
          placeholder="Например: артефакт вне зоны интереса"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="ok" size="lg" onClick={() => apply('approved')}>
          <Check size={16} />
          Принять
        </Button>
        <Button variant="bad" size="lg" onClick={() => apply('rejected')}>
          <X size={16} />
          Отклонить
        </Button>
        <Button className="col-span-2" onClick={() => apply('force_approved')}>
          Принять вопреки рекомендации
        </Button>
      </div>
    </div>
  )
}

const StudyWidget = ({ jobId }: { jobId?: string }) => {
  const { data: job, isLoading } = useJob(jobId)
  const { data: jobs } = useJobs()
  const navigate = useNavigate()

  if (isLoading || !job) return <Loader />

  const studyId = job.study_id ?? job.metadata?.study_id
  const siblings =
    groupByStudy(jobs ?? []).find((study) => study.study_id === studyId)?.jobs ?? [job]
  const index = siblings.findIndex((item) => item.id === job.id)

  const level = verdictOf(job)
  const now = job.status !== 'completed' ? 1 : job.specialist_decision ? 3 : 2
  const steps = [
    { title: 'Загружено', note: whenOf(job.created_at) },
    {
      title: 'Обработано',
      note: job.status === 'completed' ? `${nm((job.duration_ms ?? 0) / 1000)} с` : STATUS[job.status],
    },
    {
      title: 'Решение специалиста',
      note: job.specialist_decision ? DECISION[job.specialist_decision] : 'ожидается',
    },
    { title: 'В отчёте', note: job.specialist_decision ? 'готово к выгрузке' : '—' },
  ]

  return (
    <>
      <div className="mb-5.5 flex items-center gap-3.5">
        <Button variant="quiet" onClick={() => navigate('/')}>
          <ChevronLeft size={16} />
          Очередь
        </Button>
        <h1 className="h1-bold">{job.anatomical_region ? REGION[job.anatomical_region] : 'Исследование'}</h1>
        <VerdictBadge level={level} />
        <span className="flex-1" />
        <span className="small-regular text-muted">
          задача <span className="tabular">{job.id}</span>
        </span>
      </div>

      <Steps steps={steps} now={now} />

      {siblings.length > 1 ? (
        <div className="mb-4.5 flex items-center gap-3.5">
          <span className="small-regular text-muted">Снимок исследования</span>
          <Picker
            current={job}
            items={siblings}
            count={`${index + 1} из ${siblings.length}`}
            onPick={(picked) => navigate(`/study/${picked.id}`)}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-[minmax(360px,1fr)_minmax(470px,560px)] items-start gap-5">
        <Viewer job={job} className="h-[520px]" />

        <div className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-panel bg-line shadow-card">
            <Cell label="Пациент" value={job.patient_ref ?? '—'} />
            <Cell label="Поступило" value={whenOf(job.created_at)} />
            <Cell label="Область" value={job.anatomical_region ? REGION[job.anatomical_region] : '—'} />
            <Cell label="Состояние" value={STATUS[job.status]} />
            {/* The referring organisation is in the dicom_file table but not in
                the DTO — context/backend_requests.md. The file name is. */}
            <Cell label="Файл" value={job.file_name ?? '—'} />
            <Cell label="Аппарат" value={job.metadata?.device ?? '—'} />
          </div>

          {job.status === 'failed' ? (
            <Card>
              <CardBody>
                <p className="m-0 base-regular">
                  Обработка завершилась ошибкой. Переснимите исследование; если ошибка повторится,
                  сообщите в центр обработки.
                </p>
                <p className="mt-2.5 mb-0 base-regular text-ink-2">{job.error}</p>
              </CardBody>
            </Card>
          ) : (
            <Card>
              <CriteriaList job={job} />
              <QuietLine job={job} />
            </Card>
          )}

          <Card>
            <CardHead>
              <span className="h3-bold">Решение специалиста</span>
            </CardHead>
            <CardBody className="pt-0">
              <DecisionBlock job={job} />
            </CardBody>
          </Card>
        </div>
      </div>
    </>
  )
}

export default StudyWidget
