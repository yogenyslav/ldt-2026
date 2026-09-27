import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, TriangleAlert, X } from 'lucide-react'
import { cn } from '@/lib/utils'

type ToastVariant = 'default' | 'destructive'

interface IToast {
  id: number
  title: string
  variant: ToastVariant
}

interface IToastContext {
  toast: (options: { title: string; variant?: ToastVariant }) => void
}

const ToastContext = createContext<IToastContext | undefined>(undefined)

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [items, setItems] = useState<IToast[]>([])
  const nextId = useRef(1)

  const toast = useCallback(({ title, variant = 'default' }: { title: string; variant?: ToastVariant }) => {
    const id = nextId.current++
    setItems((current) => [...current, { id, title, variant }])
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), 2800)
  }, [])

  const value = useMemo(() => ({ toast }), [toast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-7 left-1/2 z-50 flex -translate-x-1/2 flex-col gap-2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-2 rounded-soft px-4 py-3 small-regular text-white shadow-menu',
              item.variant === 'destructive' ? 'bg-bad' : 'bg-brand-900',
            )}
          >
            {item.variant === 'destructive' ? <TriangleAlert size={16} /> : <Check size={16} />}
            {item.title}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast должен вызываться внутри ToastProvider')
  return context
}

export const ToastClose = X
