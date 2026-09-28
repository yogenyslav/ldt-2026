import { BarChart3, FolderClosed } from 'lucide-react'
import Card from '@/components/ui/card'
import Empty from '@/components/shared/Empty'
import { SOON } from '@/constants'

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  analytics: BarChart3,
  cases: FolderClosed,
}

/* Sections the backend has no endpoints for yet — see context/backend_requests.md. */
const Soon = ({ section }: { section: string }) => {
  const info = SOON[section]
  const Icon = ICONS[section]

  return (
    <>
      <div className="mb-5.5 flex items-center gap-3.5">
        <h1 className="h1-bold">{info.title}</h1>
        <span className="small-regular text-muted">раздел в разработке</span>
      </div>
      <Card>
        <Empty icon={<Icon size={22} />} title="Раздел в разработке" text={info.text} />
      </Card>
    </>
  )
}

export default Soon
