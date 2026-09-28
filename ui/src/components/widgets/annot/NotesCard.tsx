import Card, { CardBody, CardHead } from '@/components/ui/card'
import Chip from '@/components/ui/chip'
import Textarea from '@/components/ui/textarea'


/* Whatever is worth saying about the frame that no task asks about. Always
   open, at the bottom of the panel: folding it would mean it is never filled. */

interface NotesCardProps {
  features: string[]
  comment: string
  options: Array<{ id: string; title: string }>
  onToggle: (feature: string) => void
  onComment: (comment: string) => void
}

const NotesCard = ({ features, comment, options, onToggle, onComment }: NotesCardProps) => {
  return (
    <Card>
      <CardHead>
        <h3 className="h3-bold flex-1">Особенности снимка</h3>
      </CardHead>

      <CardBody className="pt-0">
        <div className="flex flex-wrap gap-2">
          {options.map((option) => (
            <Chip
              key={option.id}
              on={features.includes(option.id)}
              onClick={() => onToggle(option.id)}
            >
              {option.title}
            </Chip>
          ))}
        </div>

        <label className="mt-3 block">
          <span className="mb-1.5 block text-[13.5px] text-ink-2">Комментарий</span>
          <Textarea
            rows={2}
            value={comment}
            placeholder="если что-то смущает"
            onChange={(event) => onComment(event.target.value)}
            className="min-h-16 py-2.5 text-[14px]"
          />
        </label>
      </CardBody>
    </Card>
  )
}

export default NotesCard
