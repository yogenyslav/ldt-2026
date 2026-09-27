import { useState } from 'react'
import { ClipboardCopy, ClipboardList, Download, Trash2 } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardBody, CardFoot, CardHead } from '@/components/ui/card'
import Label from '@/components/ui/label'
import Textarea from '@/components/ui/textarea'
import { useToast } from '@/components/ui/toast'
import { REGION_SHORT } from '@/constants'
import { useCabinet } from '@/context/CabinetContext'
import { useJobs } from '@/hooks/useJobs'
import { useCurrentUser } from '@/hooks/useUser'
import {
  addEntry,
  journalText,
  KIND_LABEL,
  readJournal,
  removeEntry,
  type EntryKind,
} from '@/lib/journal'
import { cn, whenOf } from '@/lib/utils'

/* Faults and wishes of the technologist. No endpoint for this exists, so the log
   is kept on the station and exported as a file — see src/lib/journal.ts.
   A reference to a scan does work: the job id is ours to keep. */

const KINDS: EntryKind[] = ['fault', 'wish']

const JournalCard = () => {
  const { cabinet } = useCabinet()
  const { data: user } = useCurrentUser()
  const { data: jobs } = useJobs(20)
  const { toast } = useToast()

  const [entries, setEntries] = useState(readJournal)
  const [kind, setKind] = useState<EntryKind>('fault')
  const [text, setText] = useState('')
  const [jobId, setJobId] = useState('')

  const recent = (jobs ?? []).slice(0, 10)

  const labelOf = (id: string) => {
    const job = recent.find((item) => item.id === id)
    if (!job) return undefined
    const region = job.anatomical_region ? REGION_SHORT[job.anatomical_region] : 'область не определена'
    return `${region}, ${whenOf(job.created_at)}`
  }

  const submit = () => {
    if (!text.trim()) return
    setEntries(
      addEntry({
        kind,
        text: text.trim(),
        job_id: jobId || undefined,
        job_label: jobId ? labelOf(jobId) : undefined,
        author: user?.full_name,
      }),
    )
    setText('')
    setJobId('')
    toast({ title: 'Запись добавлена в журнал' })
  }

  const exportText = () => journalText(entries, cabinet.room || cabinet.clinic)

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportText())
      toast({ title: 'Журнал скопирован' })
    } catch {
      toast({ title: 'Браузер не дал доступ к буферу обмена', variant: 'destructive' })
    }
  }

  return (
    <Card>
      <CardHead>
        <ClipboardList size={20} className="text-muted" />
        <span className="h3-bold">Журнал сбоев и пожеланий</span>
        <span className="flex-1" />
        <span className="small-regular text-muted">записи этого кабинета</span>
      </CardHead>

      <CardBody className="flex-1 pt-0">
        <div className="mb-3.5 flex gap-2">
          {KINDS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setKind(value)}
              className={cn(
                'h-9 cursor-pointer rounded-control border-[1.5px] px-4 small-regular font-medium transition-colors',
                kind === value
                  ? 'border-brand bg-brand-050 font-semibold text-brand-700'
                  : 'border-line-2 bg-surface text-ink-2 hover:border-brand-400 hover:bg-hover',
              )}
            >
              {KIND_LABEL[value]}
            </button>
          ))}
        </div>

        <Textarea
          placeholder={
            kind === 'fault'
              ? 'Например: аппарат перестал отправлять снимки после обеда, приходится грузить вручную'
              : 'Например: хочется видеть, сколько пересъёмок было за смену'
          }
          value={text}
          onChange={(event) => setText(event.target.value)}
        />

        <div className="mt-3.5">
          <Label htmlFor="journal-job">Сослаться на исследование (необязательно)</Label>
          <select
            id="journal-job"
            value={jobId}
            onChange={(event) => setJobId(event.target.value)}
            className="h-11 w-full cursor-pointer rounded-control border-[1.5px] border-line-2 bg-surface px-4 text-[14.5px] text-ink"
          >
            <option value="">без ссылки</option>
            {recent.map((job) => (
              <option key={job.id} value={job.id}>
                {job.file_name ?? job.id} — {labelOf(job.id)}
              </option>
            ))}
          </select>
        </div>

        <Button variant="primary" className="mt-3.5" onClick={submit} disabled={!text.trim()}>
          Записать
        </Button>

        {entries.length ? (
          <div className="mt-5 flex flex-col">
            {entries.map((entry) => (
              <div key={entry.id} className="flex gap-3 border-t border-line py-3">
                <span
                  className={cn(
                    'flex-none self-start rounded-full px-2.5 py-0.5 text-[12.5px] font-medium',
                    entry.kind === 'fault' ? 'bg-bad-bg text-bad' : 'bg-brand-050 text-brand',
                  )}
                >
                  {KIND_LABEL[entry.kind]}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block base-regular">{entry.text}</span>
                  <span className="mt-0.5 block small-regular text-muted">
                    {whenOf(entry.created_at)}
                    {entry.author ? `, ${entry.author}` : ''}
                    {entry.job_label ? ` · снимок: ${entry.job_label}` : ''}
                  </span>
                </span>
                <button
                  type="button"
                  title="Удалить запись"
                  onClick={() => setEntries(removeEntry(entry.id))}
                  className="flex-center h-8 w-8 flex-none cursor-pointer rounded-soft text-muted transition-colors hover:bg-surface-3 hover:text-bad"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </CardBody>

      <CardFoot className="flex-wrap bg-surface-2">
        <Button onClick={() => void copy()} disabled={!entries.length}>
          <ClipboardCopy size={16} />
          Скопировать
        </Button>
        <a
          className={cn(
            'inline-flex h-10 items-center justify-center gap-2 rounded-control border border-line-2 bg-surface px-[18px] base-semibold text-ink transition-colors hover:border-muted hover:bg-hover',
            !entries.length && 'pointer-events-none opacity-45',
          )}
          href={`data:text/plain;charset=utf-8,${encodeURIComponent(exportText())}`}
          download="zhurnal-kabineta.txt"
        >
          <Download size={16} />
          Скачать файлом
        </a>
        <span className="small-regular text-muted">
          Замечание по конкретному снимку лучше оставить в комментарии к решению — его увидит центр
          обработки.
        </span>
      </CardFoot>
    </Card>
  )
}

export default JournalCard
