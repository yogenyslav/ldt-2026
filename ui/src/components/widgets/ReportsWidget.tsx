import { useNavigate } from 'react-router-dom'
import { Download, List } from 'lucide-react'
import Button from '@/components/ui/button'
import Card from '@/components/ui/card'
import Empty from '@/components/shared/Empty'
import Loader from '@/components/shared/Loader'
import { useToast } from '@/components/ui/toast'
import { useReports } from '@/hooks/useReports'
import { whenOf } from '@/lib/utils'

const ReportsWidget = () => {
  const { data: reports, isLoading } = useReports()
  const { toast } = useToast()
  const navigate = useNavigate()

  if (isLoading) return <Loader />

  return (
    <>
      <div className="mb-5.5 flex items-center gap-3.5">
        <h1 className="h1-bold">Отчёты</h1>
        <span className="small-regular text-muted">выгрузка результатов</span>
        <span className="flex-1" />
        <Button variant="primary" onClick={() => navigate('/')}>
          <List size={16} />
          Выбрать задачи в очереди
        </Button>
      </div>

      {reports?.length ? (
        <Card>
          <table className="w-full border-collapse text-[14.5px]">
            <thead>
              <tr className="text-left small-regular text-muted">
                <th className="border-b border-line px-4 py-3.5 font-medium">Сформирован</th>
                <th className="border-b border-line px-4 py-3.5 font-medium">Файл</th>
                <th className="border-b border-line px-4 py-3.5 font-medium" />
              </tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id} className="hover:bg-surface-2">
                  <td className="tabular border-b border-line px-4 py-3.5">
                    {whenOf(report.created_at)}
                  </td>
                  <td className="tabular border-b border-line px-4 py-3.5 text-muted">
                    {report.download_url}
                  </td>
                  <td className="border-b border-line px-4 py-3.5">
                    <Button onClick={() => toast({ title: 'Файл отчёта выгружен' })}>
                      <Download size={16} />
                      Скачать
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <Empty
            icon={<Download size={22} />}
            title="Отчётов пока нет"
            text="Выберите задачи в очереди и сформируйте отчёт — он появится здесь."
          />
        </Card>
      )}
    </>
  )
}

export default ReportsWidget
