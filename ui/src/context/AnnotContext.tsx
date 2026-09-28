import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { AnnotSource } from '@/types'

/* ============================================================
   What the annotation contour carries between its screens.

   The source filter is one thing across both: chosen in the queue,
   it travels to the desk, «следующий» walks that filtered queue and
   the counter counts the same list. Without it the doctor who came
   in through «из поликлиник» would silently be handed uploads.

   `blank` is per frame, not global: a frame uploaded without the
   models really has nothing on it, and switching frames must not
   pretend otherwise.
   ============================================================ */

export type AnnotTab = 'pending' | 'done'

interface IAnnotContext {
  source: AnnotSource | 'all'
  setSource: (source: AnnotSource | 'all') => void
  /* which half of the queue is open: still to annotate, or already annotated */
  tab: AnnotTab
  setTab: (tab: AnnotTab) => void
  /* which frame the desk has open */
  current: string | null
  /* open a frame on the desk; `blank` overrides what the queue says about it */
  open: (key: string, blank?: boolean) => void
  blank: boolean | null
  setBlank: (blank: boolean) => void
}

const AnnotContext = createContext<IAnnotContext | undefined>(undefined)

const AnnotProvider = ({ children }: { children: ReactNode }) => {
  const [source, setSource] = useState<AnnotSource | 'all'>('all')
  const [tab, setTab] = useState<AnnotTab>('pending')
  const [current, setCurrent] = useState<string | null>(null)
  const [blank, setBlank] = useState<boolean | null>(null)

  const open = useCallback((key: string, asBlank?: boolean) => {
    setCurrent(key)
    setBlank(asBlank === undefined ? null : asBlank)
  }, [])

  const value = useMemo(
    () => ({ source, setSource, tab, setTab, current, open, blank, setBlank }),
    [source, tab, current, open, blank],
  )

  return <AnnotContext.Provider value={value}>{children}</AnnotContext.Provider>
}

export default AnnotProvider

export const useAnnot = () => {
  const context = useContext(AnnotContext)
  if (!context) throw new Error('useAnnot должен вызываться внутри AnnotProvider')
  return context
}
