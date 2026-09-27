import CabinetCard from '@/components/widgets/setup/CabinetCard'
import IntakeCard from '@/components/widgets/setup/IntakeCard'
import JournalCard from '@/components/widgets/setup/JournalCard'
import StatsCard from '@/components/widgets/setup/StatsCard'

/* Settings of the room: the one screen of the technologist contour besides the
   station itself. Reached by the gear in the header, not part of the working
   flow — during a shift nobody comes here. */

const SetupWidget = () => {
  return (
    <div className="min-h-0 flex-1 overflow-auto px-8 pt-7 pb-12">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-5.5 flex items-center gap-3.5">
          <h1 className="h1-bold">Настройки кабинета</h1>
          <span className="small-regular text-muted">режим приёма, смена, статистика</span>
        </div>

        {/* Two rows: what the room works by on top, the calmer things below.
            items-stretch keeps the pair of panels in a row the same height. */}
        <div className="grid grid-cols-2 items-stretch gap-4.5">
          <IntakeCard />
          <StatsCard />
          <CabinetCard />
          <JournalCard />
        </div>
      </div>
    </div>
  )
}

export default SetupWidget
