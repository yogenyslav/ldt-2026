import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { FileText, Upload } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardFoot } from '@/components/ui/card'
import DropZone from '@/components/shared/DropZone'
import VerdictBadge from '@/components/shared/VerdictBadge'
import { useToast } from '@/components/ui/toast'
import { POLL_INTERVAL } from '@/config'
import { REGION_SHORT, STATUS } from '@/constants'
import { useJobs } from '@/hooks/useJobs'
import { useGenerateReport } from '@/hooks/useReports'
import { useUploadArchive } from '@/hooks/useUpload'
import { cn, plural } from '@/lib/utils'
import { verdictOf } from '@/lib/verdict'

const Tile = ({ label, value, tone }: { label: string; value: number; tone?: string }) => (
  <div className="rounded-panel border border-line bg-surface px-5.5 py-5">
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
  /* The archive is watched while it is being processed, so this screen asks for
     a faster refresh than the queue does. */
  const { data: jobs } = useJobs(50, 0, POLL_INTERVAL)
  const generate = useGenerateReport()
  const upload = useUploadArchive()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [batch, setBatch] = useState<{ name: string; ids: string[] } | null>(null)

  const send = async (file: File) => {
    try {
      const uploaded = await upload.mutateAsync(file)
      setBatch({ name: file.name, ids: uploaded.map((item) => item.job_id) })
      toast({ title: `Принято файлов: ${uploaded.length}` })
    } catch {
      toast({ title: 'Не удалось загрузить архив', variant: 'destructive' })
    }
  }

  if (!batch) {
    return (
      <>
        <div className="mb-5.5 flex items-center gap-3.5">
          <h1 className="h1-bold">Пакетная обработка</h1>
          <span className="small-regular text-muted">архив с исследованиями</span>
        </div>

        <DropZone
          accept=".zip"
          title="Перетащите .zip с DICOM-файлами"
          hint="или нажмите, чтобы выбрать архив. Каждый файл станет отдельной задачей."
          busy={upload.isPending}
          busyLabel="Архив загружается"
          onFile={(file) => void send(file)}
        />
      </>
    )
  }

  /* The tasks of the archive live in the same queue as everything else: the
     table follows them as they are processed. */
  const mine = (jobs ?? []).filter((job) => batch.ids.includes(job.id))
  const rows = [...mine].reverse()
  const done = mine.filter((job) => job.status === 'completed')
  const failed = mine.filter((job) => job.status === 'failed')
  const bad = done.filter((job) => verdictOf(job) === 'bad')
  const percent = Math.round((100 * (done.length + failed.length)) / (batch.ids.length || 1))

  const makeReport = async () => {
    const result = await generate.mutateAsync(mine.map((job) => job.id))
    toast({ title: `Отчёт № ${result.report_id} сформирован` })
    navigate('/reports')
  }

  return (
    <>
      <div className="mb-5.5 flex items-center gap-3.5">
        <h1 className="h1-bold">Пакетная обработка</h1>
        <span className="small-regular text-muted">
          {batch.name} — {batch.ids.length}{' '}
          {plural(batch.ids.length, 'файл', 'файла', 'файлов')}
        </span>
        <span className="flex-1" />
        <Button onClick={() => setBatch(null)}>
          <Upload size={16} />
          Новый архив
        </Button>
      </div>

      <div className="mb-4.5 grid grid-cols-[repeat(auto-fit,minmax(146px,1fr))] gap-3">
        <Tile label="Всего файлов" value={batch.ids.length} />
        <Tile label="Обработано" value={done.length} tone="ok" />
        <Tile label="К пересъёмке" value={bad.length} tone={bad.length ? 'bad' : undefined} />
        <Tile label="Ошибки" value={failed.length} tone={failed.length ? 'warn' : undefined} />
      </div>

      <Card mark>
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
            {rows.map((job) => (
              <tr
                key={job.id}
                onClick={() => navigate(`/study/${job.id}`)}
                className="hl-row cursor-pointer"
              >
                <td className="border-b border-line px-4 py-3.5 font-semibold">
                  {job.file_name ?? job.id}
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
