import { useState } from 'react'
import Button from '@/components/ui/button'
import Chip from '@/components/ui/chip'
import Modal from '@/components/ui/modal'
import DropZone from '@/components/shared/DropZone'
import { useToast } from '@/components/ui/toast'
import { useAddToQueue } from '@/hooks/useAnnotation'
import { cn, plural } from '@/lib/utils'

/* ============================================================
   Adding frames of one's own to the queue.

   Whether to run the models is decided here, once, because it
   decides what the annotator sees on the desk afterwards: a frame
   with the suggestions already on it, or an empty one with nothing
   but the regions and the rules.
   ============================================================ */

const OPTIONS = [
  {
    id: 'pre',
    title: 'Прогнать через модели',
    text:
      'Модель ставит точки, окна и полигоны. Разметчик правит или подтверждает; ' +
      'нетронутая точка в обучение не идёт. Быстрее на снимок, но глаз тянется согласиться с моделью.',
  },
  {
    id: 'blank',
    title: 'Без моделей, размечать с нуля',
    text:
      'Снимок приходит пустым: только области, где искать точки, и правила. Медленнее, зато разметка ' +
      'ничем не подсказана — то, что нужно для контрольной выборки и спорных случаев.',
  },
]

const UploadSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [mode, setMode] = useState('pre')
  const [urgent, setUrgent] = useState(false)
  const [files, setFiles] = useState<string[]>([])
  const add = useAddToQueue()
  const { toast } = useToast()

  const close = () => {
    setFiles([])
    onClose()
  }

  const send = async () => {
    const count = files.length || 1
    await add.mutateAsync({ count, pre: mode === 'pre', urgent })
    toast({
      title: `В очередь добавлено ${count} ${plural(count, 'снимок', 'снимка', 'снимков')}`,
    })
    close()
  }

  return (
    <Modal open={open} title="Добавить снимки в очередь" onClose={close}>
      <DropZone
        accept=".dcm,.zip,application/dicom,application/zip"
        title="DICOM или архив — перетащите сюда"
        hint="принимаются .dcm и .zip, область съёмки определяется автоматически"
        onFile={(file) => setFiles((current) => [...current, file.name])}
      />

      {files.length ? (
        <p className="mt-2.5 mb-0 small-regular text-ink-2">
          Выбрано: {files.length} — {files.join(', ')}
        </p>
      ) : null}

      <div className="mt-4">
        <span className="mb-1.5 block text-[13.5px] text-ink-2">Что делать после загрузки</span>
        <div className="grid grid-cols-2 gap-3">
          {OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              className={cn(
                'cursor-pointer rounded-soft border-[1.5px] p-3.5 text-left transition-colors',
                mode === option.id
                  ? 'border-brand bg-brand-050'
                  : 'border-line-2 bg-surface hover:bg-hover',
              )}
            >
              <b className="block text-[15px]">{option.title}</b>
              <p className="mt-1.5 mb-0 text-[13.5px] text-muted">{option.text}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        <span className="mb-1.5 block text-[13.5px] text-ink-2">Куда поставить</span>
        <div className="flex flex-wrap gap-2">
          <Chip on={!urgent} onClick={() => setUrgent(false)}>
            в конец очереди
          </Chip>
          <Chip on={urgent} onClick={() => setUrgent(true)}>
            срочно
          </Chip>
        </div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!files.length || add.isPending} onClick={send}>
          Добавить в очередь
        </Button>
        <span className="flex-1" />
        <span className="text-[13.5px] text-muted">файлы не покидают контур ЦДиТ</span>
      </div>
    </Modal>
  )
}

export default UploadSheet
