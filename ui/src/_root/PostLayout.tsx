import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import TopBar from '@/components/widgets/TopBar'

const PostLayout = () => {
  const [clock, setClock] = useState('')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setClock(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      )
    }
    tick()
    const timer = setInterval(tick, 20_000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="flex h-screen flex-col">
      <TopBar
        logo={
          <span
            role="img"
            aria-label="Городская поликлиника"
            className="block h-11 w-11 bg-[#5fd6dc]"
            style={{
              maskImage: 'url(/assets/logo-mos.svg)',
              WebkitMaskImage: 'url(/assets/logo-mos.svg)',
              maskRepeat: 'no-repeat',
              WebkitMaskRepeat: 'no-repeat',
              maskPosition: 'center',
              WebkitMaskPosition: 'center',
              maskSize: 'contain',
              WebkitMaskSize: 'contain',
            }}
          />
        }
        title="Городская поликлиника № 218"
        subtitle="Кабинет 3 · денситометрия"
        meta={
          <>
            <span>GE Lunar Prodigy Advance</span>
            <span className="text-white/25">·</span>
            <span>enCORE 18.41.005</span>
          </>
        }
        right={
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-2 small-regular font-medium text-[#5fe0a8]">
              <i className="h-[7px] w-[7px] animate-pulse rounded-full bg-[#5fe0a8]" />
              связь с аппаратом есть
            </span>
            <span className="text-white/25">·</span>
            <span className="tabular small-regular text-white/65">{clock}</span>
          </div>
        }
      />
      <Outlet />
    </div>
  )
}

export default PostLayout
