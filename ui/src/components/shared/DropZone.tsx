import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

/* One way of handing a file over, used by both contours: the technologist gives
   a single scan, the centre gives an archive. */

interface DropZoneProps {
  accept: string
  title: string
  hint: string
  busy?: boolean
  busyLabel?: string
  className?: string
  onFile: (file: File) => void
}

const DropZone = ({ accept, title, hint, busy, busyLabel, className, onFile }: DropZoneProps) => {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)

  const take = (file?: File | null) => {
    if (file && !busy) onFile(file)
  }

  return (
    <>
      <input
        ref={input}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(event) => {
          take(event.target.files?.[0])
          /* so that the same file can be chosen twice in a row */
          event.target.value = ''
        }}
      />

      <button
        type="button"
        disabled={busy}
        onClick={() => input.current?.click()}
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          take(event.dataTransfer.files?.[0])
        }}
        className={cn(
          'flex w-full cursor-pointer flex-col items-center gap-2.5 rounded-soft border-[1.5px] border-dashed border-line-2 bg-surface px-6 py-13 text-center transition-colors',
          'hover:border-brand-400 hover:bg-brand-050 disabled:cursor-progress',
          over && 'border-brand bg-brand-050',
          className,
        )}
      >
        <span className="flex-center h-11.5 w-11.5 rounded-full bg-brand-050 text-brand">
          {busy ? (
            <span className="h-6 w-6 animate-spin rounded-full border-[3px] border-brand-100 border-t-brand" />
          ) : (
            <Upload size={22} />
          )}
        </span>
        <span className="h3-bold">{busy ? (busyLabel ?? 'Файл загружается') : title}</span>
        <span className="small-regular text-muted">{busy ? 'подождите' : hint}</span>
      </button>
    </>
  )
}

export default DropZone
