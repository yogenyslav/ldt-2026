import { Check, RefreshCw } from 'lucide-react'
import Button from '@/components/ui/button'
import Modal from '@/components/ui/modal'
import { useToast } from '@/components/ui/toast'
import { REGION } from '@/constants'
import { useDecideJob } from '@/hooks/useJobs'
import { brokenNames } from '@/lib/criteria'
import { timeOf } from '@/lib/utils'
import type { Decision, IJobInfo } from '@/types'

/* A scan that has been analysed but not decided on must not be left behind:
   the next shift — or the same technologist after a sign-in — would meet it on
   the screen again, without knowing whether the patient had already left.
   So the way out of the station goes through a decision. */

interface LeaveGuardProps {
  job?: IJobInfo
  open: boolean
  /* carries on with whatever the specialist was trying to do */
  onDone: () => void
  onCancel: () => void
}

const LeaveGuard = ({ job, open, onDone, onCancel }: LeaveGuardProps) => {
  const decide = useDecideJob()
  const { toast } = useToast()

  if (!job || !open) return null

  const region = job.anatomical_region ? REGION[job.anatomical_region] : 'Область не определена'
  const broken = job.status === 'completed' ? brokenNames(job) : []

  const apply = async (decision: Decision) => {
    await decide.mutateAsync({ jobIds: [job.id], decision })
    toast({ title: decision === 'approved' ? 'Исследование принято' : 'Отправлено на пересъёмку' })
    onDone()
  }

  return (
    <Modal
      open
      title="Исследование не разобрано"
      note={`${region}, ${timeOf(job.created_at)}`}
      onClose={onCancel}
      className="max-w-[540px]"
    >
      <p className="mt-0 mb-4 base-regular text-ink-2">
        На экране остался снимок без решения
        {broken.length ? `: ${broken.join(', ')}` : ''}. Примите его или отправьте на пересъёмку —
        иначе он встретит вас на этом же экране при следующем входе.
      </p>

      <div className="grid grid-cols-2 gap-2.5">
        <Button
          variant="ok"
          size="lg"
          disabled={decide.isPending}
          onClick={() => void apply('approved')}
        >
          <Check size={16} />
          Принять
        </Button>
        <Button size="lg" disabled={decide.isPending} onClick={() => void apply('rejected')}>
          <RefreshCw size={16} />
          Переснять
        </Button>
      </div>

      <Button variant="quiet" className="mt-2.5 w-full" onClick={onCancel}>
        Остаться на экране
      </Button>
    </Modal>
  )
}

export default LeaveGuard
