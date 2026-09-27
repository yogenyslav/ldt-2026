import Card, { CardBody, CardFoot, CardHead } from '@/components/ui/card'
import Input from '@/components/ui/input'
import Label from '@/components/ui/label'
import { useCabinet } from '@/context/CabinetContext'
import { useCurrentUser, useOrgId } from '@/hooks/useUser'
import type { ICabinet } from '@/lib/cabinet'

/* Where we are and who is working. The specialist comes from the backend; the
   room does not — the organisation table has a name, but no endpoint exposes it,
   so the four fields below are filled in once during setup.
   context/backend_requests.md */

const FIELDS: Array<{ key: keyof ICabinet; label: string; placeholder: string }> = [
  { key: 'clinic', label: 'Организация', placeholder: 'Городская поликлиника № 218' },
  { key: 'room', label: 'Кабинет', placeholder: 'Кабинет 3 · денситометрия' },
  { key: 'device', label: 'Аппарат', placeholder: 'GE Lunar Prodigy Advance' },
  { key: 'software', label: 'Программа аппарата', placeholder: 'enCORE 18.41.005' },
]

const CabinetCard = () => {
  const { cabinet, update } = useCabinet()
  const { data: user } = useCurrentUser()
  const orgId = useOrgId()

  return (
    <Card>
      <CardHead>
        <span className="h3-bold">Кабинет и специалист</span>
      </CardHead>

      <CardBody className="grid grid-cols-2 gap-3.5 pt-0">
        {FIELDS.map((field) => (
          <div key={field.key}>
            <Label htmlFor={field.key}>{field.label}</Label>
            <Input
              id={field.key}
              placeholder={field.placeholder}
              value={String(cabinet[field.key])}
              onChange={(event) => update({ [field.key]: event.target.value })}
            />
          </div>
        ))}
      </CardBody>

      <CardFoot className="bg-surface-2">
        <span className="small-regular text-muted">
          Смена: <b className="font-medium text-ink-2">{user?.full_name ?? '—'}</b>
          {', '}
          {user?.role === 'admin' ? 'врач-рентгенолог' : 'рентгенолаборант'}
          {orgId ? `, организация № ${orgId}` : ''}
        </span>
      </CardFoot>
    </Card>
  )
}

export default CabinetCard
