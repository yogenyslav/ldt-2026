import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { cn } from '@/lib/utils'

/* One way of handing a file over, used by both contours: the technologist gives
   a single scan, the centre gives an archive. The dark tone is for the station,
   where the panel sits inside the scan viewport. */

interface DropZoneProps {
  accept: string
  title: string
  hint: string
  /* an explicit button inside the zone; without it the whole zone is the button */
  action?: string
  busy?: boolean
  busyLabel?: string
  tone?: 'light' | 'dark'
  className?: string
  onFile: (file: File) => void
}

const DropZone = ({
  accept,
  title,
  hint,
  action,
  busy,
  busyLabel,
  tone = 'light',
  className,
  onFile,
}: DropZoneProps) => {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const dark = tone === 'dark'

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
          'flex w-full cursor-pointer flex-col items-center rounded-soft border-[1.5px] border-dashed text-center transition-colors disabled:cursor-progress',
          dark
            ? 'gap-3.5 rounded-control border-scan-edge bg-white/[0.02] px-7 py-8 hover:border-brand-400 hover:bg-white/[0.05]'
            : 'gap-2.5 border-line-2 bg-surface px-6 py-13 hover:border-brand-400 hover:bg-brand-050',
          over && (dark ? 'border-brand-400 bg-white/[0.06]' : 'border-brand bg-brand-050'),
          className,
        )}
      >
        <span
          className={cn(
            'flex-center flex-none',
            dark
              ? 'h-13 w-13 rounded-control bg-brand-400/15 text-brand-400'
              : 'h-11.5 w-11.5 rounded-full bg-brand-050 text-brand',
          )}
        >
          {busy ? (
            <span
              className={cn(
                'h-6 w-6 animate-spin rounded-full border-[3px]',
                dark ? 'border-white/15 border-t-brand-400' : 'border-brand-100 border-t-brand',
              )}
            />
          ) : (
            <Upload size={dark ? 24 : 22} />
          )}
        </span>

        <span className={cn(dark ? 'text-[19px] font-bold tracking-[-0.02em] text-scan-text-on' : 'h3-bold')}>
          {busy ? (busyLabel ?? 'Файл загружается') : title}
        </span>

        <span className={cn('small-regular', dark ? 'text-scan-text' : 'text-muted')}>
          {busy ? 'подождите' : hint}
        </span>

        {action && !busy ? (
          <span className="mt-1.5 flex-center h-11 rounded-control border border-brand bg-brand px-5.5 base-semibold text-white">
            {action}
          </span>
        ) : null}
      </button>
    </>
  )
}

export default DropZone
