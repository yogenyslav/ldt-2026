import { useParams } from 'react-router-dom'
import StudyWidget from '@/components/widgets/StudyWidget'

const Study = () => {
  const { jobId } = useParams()
  return <StudyWidget jobId={jobId} />
}

export default Study
