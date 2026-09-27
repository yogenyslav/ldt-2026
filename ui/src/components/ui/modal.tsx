import { useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/* A panel over the screen for things that would only distract in place: the
   list of logged faults, and whatever else comes later. Closes on Escape and
   on a click outside, like every dialog people already know. */

interface ModalProps {
  open: boolean
  title: string
  note?: string
  onClose: () => void
  children: React.ReactNode
  className?: string
}

const Modal = ({ open, title, note, onClose, children, className }: ModalProps) => {
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-brand-900/45 p-6"
    >
      <div
        onClick={(event) => event.stopPropagation()}
        className={cn(
          'flex max-h-[80vh] w-full max-w-[620px] flex-col overflow-hidden rounded-panel border border-line bg-surface',
          className,
        )}
      >
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="h3-bold">{title}</div>
            {note ? <div className="mt-0.5 small-regular text-muted">{note}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            title="Закрыть"
            aria-label="Закрыть"
            className="flex-center h-9 w-9 flex-none cursor-pointer rounded-control text-muted transition-colors hover:bg-surface-3 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

export default Modal
