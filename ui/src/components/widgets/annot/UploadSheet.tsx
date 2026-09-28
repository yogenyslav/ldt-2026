import { useState } from 'react'
import Button from '@/components/ui/button'
import Modal from '@/components/ui/modal'
import DropZone from '@/components/shared/DropZone'
import { useToast } from '@/components/ui/toast'
import { useUpload } from '@/hooks/useUpload'
import { errorText } from '@/lib/errors'
import { plural } from '@/lib/utils'

/* ============================================================
   Adding frames of one's own to the annotation queue.

   The upload is the ordinary one — the same endpoint the batch screen
   uses, and the models run over every frame as always: without a
   prediction there is nothing to measure the annotation against and
   nothing to compare a new version of a model with.

   There is no choice to make here. A frame goes into the queue when
   it has been analysed, and once annotated it does not disappear —
   it joins the list that can be corrected.
   ============================================================ */

const UploadSheet = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const [files, setFiles] = useState<File[]>([])
  const upload = useUpload()
  const { toast } = useToast()

  const close = () => {
    setFiles([])
    onClose()
  }

  const send = async () => {
    try {
      const jobIds: string[] = []

      for (const file of files) {
        const created = await upload.mutateAsync(file)
        jobIds.push(...created)
      }

      toast({
        title: `Загружено ${jobIds.length} ${plural(jobIds.length, 'снимок', 'снимка', 'снимков')}`,
      })
      close()
    } catch (error) {
      toast({ variant: 'destructive', title: errorText(error, 'Не удалось загрузить снимки') })
    }
  }

  return (
    <Modal open={open} title="Добавить снимки в очередь разметки" onClose={close}>
      <DropZone
        accept=".dcm,.zip,application/dicom,application/zip"
        title="DICOM или архив — перетащите сюда"
        hint="принимаются .dcm и .zip, область съёмки определяется автоматически"
        busy={upload.isPending}
        onFile={(file) => setFiles((current) => [...current, file])}
      />

      {files.length ? (
        <p className="mt-2.5 mb-0 small-regular text-ink-2">
          Выбрано: {files.map((file) => file.name).join(', ')}
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="primary" disabled={!files.length || upload.isPending} onClick={send}>
          {upload.isPending ? 'Загружается…' : 'Загрузить'}
        </Button>
        <span className="flex-1" />
        <span className="text-[13.5px] text-muted">файлы не покидают контур ЦДиТ</span>
      </div>
    </Modal>
  )
}

export default UploadSheet
