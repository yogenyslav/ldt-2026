import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Upload } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardFoot } from '@/components/ui/card'
import Loader from '@/components/shared/Loader'
import VerdictBadge from '@/components/shared/VerdictBadge'
import { useToast } from '@/components/ui/toast'
import { REGION_SHORT, STATUS } from '@/constants'
import { useJobs } from '@/hooks/useJobs'
import { useGenerateReport } from '@/hooks/useReports'
import ApiDicom from '@/services/apiDicom'
import { cn } from '@/lib/utils'
import { verdictOf } from '@/lib/verdict'
import type { IJobInfo } from '@/types'

const Tile = ({ label, value, tone }: { label: string; value: number; tone?: string }) => (
  <div className="rounded-panel bg-surface px-5.5 py-5 shadow-card">
    <div className="small-regular text-muted">{label}</div>
    <div
      className={cn(
        'tabular mt-1.5 text-[30px] leading-none font-bold tracking-[-0.02em]',
        tone === 'ok' && 'text-ok',
        tone === 'bad' && 'text-bad',
        tone === 'warn' && 'text-warn',
      )}
    >
      {value}
    </div>
  </div>
)

const BatchWidget = () => {
  const { data: jobs } = useJobs()
  const generate = useGenerateReport()
  const { toast } = useToast()
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)

  const [batch, setBatch] = useState<{ name: string; jobs: IJobInfo[] } | null>(null)
  const [busy, setBusy] = useState(false)

  const upload = async (file: File) => {
    setBusy(true)
    try {
      const response = await ApiDicom.uploadBatch(file)
      const ids = response.data.data.map((item) => item.job_id)
      setBatch({
        name: file.name,
        jobs: (jobs ?? []).filter((job) => ids.includes(job.id)),
      })
      toast({ title: `Принято файлов: ${ids.length}` })
    } catch {
      toast({ title: 'Не удалось загрузить архив', variant: 'destructive' })
    } finally {
      setBusy(false)
    }
  }

  if (busy) return <Loader label="Архив загружается" />

  if (!batch) {
    return (
      <>
        <div className="mb-5.5 flex items-center gap-3.5">
          <h1 className="h1-bold">Пакетная обработка</h1>
          <span className="small-regular text-muted">архив с исследованиями</span>
        </div>

        <input
          ref={fileInput}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
          }}
        />

        <div
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault()
            const file = event.dataTransfer.files?.[0]
            if (file) void upload(file)
          }}
          className="flex cursor-pointer flex-col items-center gap-2.5 rounded-soft border-[1.5px] border-dashed border-line-2 bg-surface px-6 py-13 text-center transition-colors hover:border-brand-400 hover:bg-brand-050"
        >
          <span className="flex-center h-11.5 w-11.5 rounded-full bg-brand-050 text-brand">
            <Upload size={22} />
          </span>
          <span className="h3-bold">Перетащите .zip с DICOM-файлами</span>
          <span className="small-regular text-muted">
            или нажмите, чтобы выбрать архив. Каждый файл станет отдельной задачей.
          </span>
        </div>
      </>
    )
  }

  const done = batch.jobs.filter((job) => job.status === 'completed')
  const failed = batch.jobs.filter((job) => job.status === 'failed')
  const bad = done.filter((job) => verdictOf(job) === 'bad')
  const percent = Math.round((100 * (done.length + failed.length)) / (batch.jobs.length || 1))

  const makeReport = async () => {
    const result = await generate.mutateAsync(batch.jobs.map((job) => job.id))
    toast({ title: `Отчёт № ${result.report_id} сформирован` })
    navigate('/reports')
  }

  return (
    <>
      <div className="mb-5.5 flex items-center gap-3.5">
        <h1 className="h1-bold">Пакетная обработка</h1>
        <span className="small-regular text-muted">{batch.name}</span>
        <span className="flex-1" />
        <Button onClick={() => setBatch(null)}>
          <Upload size={16} />
          Новый архив
        </Button>
      </div>

      <div className="mb-4.5 grid grid-cols-[repeat(auto-fit,minmax(146px,1fr))] gap-3">
        <Tile label="Всего файлов" value={batch.jobs.length} />
        <Tile label="Обработано" value={done.length} tone="ok" />
        <Tile label="К пересъёмке" value={bad.length} tone={bad.length ? 'bad' : undefined} />
        <Tile label="Ошибки" value={failed.length} tone={failed.length ? 'warn' : undefined} />
      </div>

      <Card>
        <div className="flex items-center gap-3 px-5.5 pt-4.5 pb-3.5">
          <span className="h3-bold">Ход обработки</span>
          <span className="flex-1" />
          <span className="tabular small-regular text-muted">{percent}%</span>
        </div>
        <div className="px-5.5 pb-4.5">
          <div className="h-1 overflow-hidden rounded-sm bg-line">
            <div className="h-full bg-brand transition-[width]" style={{ width: `${percent}%` }} />
          </div>
        </div>

        <table className="w-full border-collapse text-[14.5px]">
          <thead>
            <tr className="text-left small-regular text-muted">
              <th className="border-b border-line px-4 py-3.5 font-medium">Файл</th>
              <th className="border-b border-line px-4 py-3.5 font-medium">Область</th>
              <th className="border-b border-line px-4 py-3.5 font-medium">Состояние</th>
              <th className="border-b border-line px-4 py-3.5 font-medium">Вердикт</th>
            </tr>
          </thead>
          <tbody>
            {batch.jobs.map((job, index) => (
              <tr
                key={job.id}
                onClick={() => navigate(`/study/${job.id}`)}
                className="cursor-pointer hover:bg-surface-2"
              >
                <td className="border-b border-line px-4 py-3.5 font-semibold">
                  CR{100 + index}_
                  {job.anatomical_region === 'spine'
                    ? 'ПОП'
                    : job.anatomical_region === 'hip_left'
                      ? 'ЛПОБ'
                      : 'ППОБ'}
                  .dcm
                </td>
                <td className="border-b border-line px-4 py-3.5">
                  {job.anatomical_region ? REGION_SHORT[job.anatomical_region] : '—'}
                </td>
                <td className="border-b border-line px-4 py-3.5">{STATUS[job.status]}</td>
                <td className="border-b border-line px-4 py-3.5">
                  <VerdictBadge level={verdictOf(job)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <CardFoot className="bg-surface-2">
          <Button variant="primary" onClick={makeReport} disabled={percent < 100}>
            <FileText size={16} />
            Сформировать отчёт по архиву
          </Button>
          <span className="small-regular text-muted">
            {percent < 100 ? 'доступно после обработки всех файлов' : 'готово'}
          </span>
        </CardFoot>
      </Card>
    </>
  )
}

export default BatchWidget
