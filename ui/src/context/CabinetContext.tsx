import { createContext, useCallback, useContext, useState } from 'react'
import type { ReactNode } from 'react'
import { readCabinet, writeCabinet, type ICabinet } from '@/lib/cabinet'

/* The settings of the station are shared by the whole technologist contour: the
   station screen decides how it waits for a scan, the settings screen changes
   it, the header shows where we are. */

interface ICabinetContext {
  cabinet: ICabinet
  update: (patch: Partial<ICabinet>) => void
}

const CabinetContext = createContext<ICabinetContext | undefined>(undefined)

const CabinetProvider = ({ children }: { children: ReactNode }) => {
  const [cabinet, setCabinet] = useState<ICabinet>(readCabinet)

  const update = useCallback((patch: Partial<ICabinet>) => {
    setCabinet((current) => {
      const next = { ...current, ...patch }
      writeCabinet(next)
      return next
    })
  }, [])

  return <CabinetContext.Provider value={{ cabinet, update }}>{children}</CabinetContext.Provider>
}

export default CabinetProvider

export const useCabinet = () => {
  const context = useContext(CabinetContext)
  if (!context) throw new Error('useCabinet должен вызываться внутри CabinetProvider')
  return context
}
