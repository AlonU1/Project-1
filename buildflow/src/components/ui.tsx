import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx, initials } from '../lib/util'
import type { User } from '../data/types'

export function Btn({ children, onClick, variant = 'default', size = 'md', className, disabled, type = 'button', title }: {
  children: ReactNode
  onClick?: () => void
  variant?: 'default' | 'primary' | 'success' | 'danger' | 'neutral' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  className?: string
  disabled?: boolean
  type?: 'button' | 'submit'
  title?: string
}) {
  const v = {
    default: 'bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700',
    primary: 'bg-brand text-white hover:bg-brand-strong border border-transparent',
    success: 'bg-st-closed text-white hover:brightness-110 border border-transparent',
    danger: 'bg-st-open text-white hover:brightness-110 border border-transparent',
    neutral: 'bg-slate-600 text-white hover:bg-slate-700 border border-transparent',
    ghost: 'hover:bg-slate-100 dark:hover:bg-slate-800 border border-transparent',
  }[variant]
  const s = { sm: 'px-2.5 py-1.5 text-xs', md: 'px-3.5 py-2 text-sm', lg: 'px-5 py-3 text-base' }[size]
  return (
    <button type={type} disabled={disabled} onClick={onClick} title={title}
      className={cx('rounded-lg font-medium transition-colors inline-flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed', v, s, className)}>
      {children}
    </button>
  )
}

export const Card = ({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) => (
  <div onClick={onClick} className={cx('bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm', onClick && 'cursor-pointer hover:shadow-md transition-shadow', className)}>
    {children}
  </div>
)

export const Chip = ({ children, active, onClick, className }: { children: ReactNode; active?: boolean; onClick?: () => void; className?: string }) => (
  <button type="button" onClick={onClick}
    className={cx('px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap',
      active ? 'bg-brand text-white border-brand' : 'bg-white dark:bg-slate-800 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:border-brand',
      className)}>
    {children}
  </button>
)

export const Badge = ({ children, className }: { children: ReactNode; className?: string }) => (
  <span className={cx('inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold border', className)}>{children}</span>
)

export const Label = ({ children, required }: { children: ReactNode; required?: boolean }) => (
  <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1">
    {children}{required && <span className="text-st-open ms-1">*</span>}
  </label>
)

const fieldCls = 'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40 focus:border-brand'

export const Input = (p: React.InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cx(fieldCls, p.className)} />
export const TextArea = (p: React.TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea {...p} className={cx(fieldCls, 'min-h-20', p.className)} />
export const Select = (p: React.SelectHTMLAttributes<HTMLSelectElement>) => <select {...p} className={cx(fieldCls, p.className)} />

export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={cx('relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-xl w-full max-h-[92vh] overflow-y-auto', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-5 py-3.5 flex items-center justify-between z-10">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export const EmptyState = ({ icon, title, hint, action }: { icon: ReactNode; title: string; hint?: string; action?: ReactNode }) => (
  <div className="flex flex-col items-center justify-center py-16 text-center">
    <div className="text-slate-300 dark:text-slate-600 mb-3">{icon}</div>
    <div className="font-semibold text-slate-600 dark:text-slate-300">{title}</div>
    {hint && <div className="text-sm text-slate-400 mt-1 max-w-sm">{hint}</div>}
    {action && <div className="mt-4">{action}</div>}
  </div>
)

export const Avatar = ({ user, size = 32 }: { user?: User | null; size?: number }) => (
  <div className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
    style={{ width: size, height: size, fontSize: size * 0.38, backgroundColor: user?.color ?? '#94a3b8' }}
    title={user?.full_name}>
    {user ? initials(user.full_name) : '?'}
  </div>
)

export const Spinner = () => (
  <div className="flex items-center justify-center py-20">
    <div className="w-8 h-8 border-3 border-brand border-t-transparent rounded-full animate-spin" />
  </div>
)
