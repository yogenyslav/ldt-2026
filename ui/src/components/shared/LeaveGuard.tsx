import { Check, X } from 'lucide-react'
import Button from '@/components/ui/button'
import Modal from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { REGION } from '@/constants'
import { useStation } from '@/context/StationContext'
import { plural } from '@/lib/utils'

/* A visit with analysed attempts and no decision must not be left behind: the
   next shift — or the same technologist after a sign-in — would meet it on the
   screen without knowing whether the patient had already left. So the way out
   of the station goes through closing the visit. */

interface LeaveGuardProps {
  open: boolean
  /* carries on with whatever the specialist was trying to do */
  onDone: () => void
  onCancel: () => void
}

const LeaveGuard = ({ open, onDone, onCancel }: LeaveGuardProps) => {
  const { attempts, current, patient, accept, dismiss } = useStation()
  const { toast } = useToast()

  if (!open || !current) return null

  const region = current.anatomical_region ? REGION[current.anatomical_region] : 'Область не определена'

  const take = async () => {
    await accept(current)
    toast({ title: 'Исследование принято' })
    onDone()
  }

  const drop = async () => {
    await dismiss()
    toast({ title: 'Посещение закрыто без приёма', variant: 'destructive' })
    onDone()
  }

  return (
    <Modal
      open
      title="Исследование не закрыто"
      note={`Пациент ${patient || '—'} · ${attempts.length} ${plural(attempts.length, 'попытка', 'попытки', 'попыток')}`}
      onClose={onCancel}
      className="max-w-[540px]"
    >
      <p className="mt-0 mb-4 base-regular text-ink-2">
        По этому пациенту ещё не выбрана принятая попытка ({region}). Примите последнюю или
        закройте посещение — иначе оно встретит вас на этом же экране при следующем входе.
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        <Button variant="ok" size="lg" onClick={() => void take()}>
          <Check size={16} />
          Принять последнюю
        </Button>
        <Button variant="bad" size="lg" onClick={() => void drop()}>
          <X size={16} />
          Ни одна не подошла
        </Button>
      </div>

      <Button variant="quiet" className="mt-2.5 w-full" onClick={onCancel}>
        Остаться на экране
      </Button>
    </Modal>
  )
}

export default LeaveGuard
