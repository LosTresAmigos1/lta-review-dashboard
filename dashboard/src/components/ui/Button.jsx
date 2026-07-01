const BASE = 'inline-flex items-center gap-1.5 font-medium rounded-lg transition-all duration-150 focus-visible:outline-none disabled:opacity-40 disabled:cursor-not-allowed select-none'

const VARIANTS = {
  primary:   'bg-amber-700 text-white hover:bg-amber-800 active:bg-amber-900 shadow-sm text-xs px-3.5 py-2',
  secondary: 'bg-white text-stone-700 hover:bg-stone-50 border border-stone-200 hover:border-stone-300 shadow-xs text-xs px-3.5 py-2',
  ghost:     'text-stone-500 hover:text-stone-800 hover:bg-stone-100 text-xs px-2.5 py-1.5',
  danger:    'bg-red-50 text-red-700 hover:bg-red-100 border border-red-200 text-xs px-3.5 py-2',
  accent:    'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200 text-xs px-3.5 py-2',
}

export default function Button({ variant = 'secondary', size, className = '', children, ...props }) {
  return (
    <button className={`${BASE} ${VARIANTS[variant] ?? VARIANTS.secondary} ${className}`} {...props}>
      {children}
    </button>
  )
}
