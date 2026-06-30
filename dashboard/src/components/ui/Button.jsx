const VARIANTS = {
  primary:   'bg-amber-500 text-white hover:bg-amber-600 border border-amber-500',
  secondary: 'bg-stone-100 text-stone-600 hover:bg-stone-200 border border-stone-200',
  ghost:     'bg-transparent text-stone-600 hover:bg-stone-100 border border-transparent',
}

export default function Button({ variant = 'secondary', className = '', children, ...props }) {
  return (
    <button
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    >
      {children}
    </button>
  )
}
