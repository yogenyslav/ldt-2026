import { useState } from 'react'
import { Check, Pencil, User, X } from 'lucide-react'
import Button from '@/components/ui/button'
import Card, { CardBody, CardFoot, CardHead } from '@/components/ui/card'
import Input from '@/components/ui/input'
import Label from '@/components/ui/label'
import { useToast } from '@/components/ui/toast'
import { useCabinet } from '@/context/CabinetContext'
import { useCurrentUser } from '@/hooks/useUser'
import type { ICabinet } from '@/lib/cabinet'

/* Where we are and who is working. Read-only by default: the data is filled in
   once at installation, and a value that can be overwritten by a stray click is
   worse than no value at all.

   The four cells fill the card, two by two, so the table reads as the body of
   the card rather than as a block dropped into its top corner. */

type Field = 'clinic' | 'room' | 'device' | 'software'

const FIELDS: Array<{ key: Field; label: string; placeholder: string }> = [
  { key: 'clinic', label: 'Организация', placeholder: 'Городская поликлиника № 218' },
  { key: 'room', label: 'Кабинет', placeholder: 'Кабинет 3 · денситометрия' },
  { key: 'device', label: 'Аппарат', placeholder: 'GE Lunar Prodigy Advance' },
  { key: 'software', label: 'Программа аппарата', placeholder: 'enCORE 18.41.005' },
]

const CabinetCard = () => {
  const { cabinet, update } = useCabinet()
  const { data: user } = useCurrentUser()
  const { toast } = useToast()

  const [draft, setDraft] = useState<ICabinet | null>(null)

  const save = () => {
    if (!draft) return
    update({
      clinic: draft.clinic.trim(),
      room: draft.room.trim(),
      device: draft.device.trim(),
      software: draft.software.trim(),
    })
    setDraft(null)
    toast({ title: 'Данные кабинета сохранены' })
  }

  return (
    <Card>
      <CardHead>
        <User size={20} className="text-muted" />
        <span className="h3-bold">Кабинет и специалист</span>
        <span className="flex-1" />
        <span className="small-regular text-muted">{user?.full_name ?? '—'}</span>
      </CardHead>

      <CardBody className="flex-1 pt-0">
        {draft ? (
          <div className="grid grid-cols-2 gap-3.5">
            {FIELDS.map((field) => (
              <div key={field.key}>
                <Label htmlFor={field.key}>{field.label}</Label>
                <Input
                  id={field.key}
                  placeholder={field.placeholder}
                  value={draft[field.key]}
                  autoFocus={field.key === 'room'}
                  onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="grid h-full grid-cols-2 grid-rows-2 gap-px overflow-hidden rounded-control border border-line bg-line">
            {FIELDS.map((field) => (
              <div key={field.key} className="flex flex-col justify-center bg-surface px-4 py-3">
                <div className="text-[13px] text-muted">{field.label}</div>
                <div
                  className={
                    cabinet[field.key]
                      ? 'mt-0.5 base-semibold'
                      : 'mt-0.5 base-regular text-muted'
                  }
                >
                  {cabinet[field.key] || 'не указан'}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardBody>

      <CardFoot className="bg-surface-2">
        {draft ? (
          <>
            <Button variant="primary" onClick={save}>
              <Check size={16} />
              Сохранить
            </Button>
            <Button variant="quiet" onClick={() => setDraft(null)}>
              <X size={16} />
              Отмена
            </Button>
          </>
        ) : (
          <>
            <Button onClick={() => setDraft({ ...cabinet })}>
              <Pencil size={16} />
              Изменить
            </Button>
            <span className="small-regular text-muted">
              смена: {user?.role === 'admin' ? 'врач-рентгенолог' : 'рентгенолаборант'}
            </span>
          </>
        )}
      </CardFoot>
    </Card>
  )
}

export default CabinetCard
