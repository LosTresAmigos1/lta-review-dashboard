const VARIANTS = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger:  'badge-danger',
  info:    'badge-info',
  neutral: 'badge-neutral',
  accent:  'badge-accent',
}

export default function Badge({ variant = 'neutral', children, className = '' }) {
  return (
    <span className={`badge ${VARIANTS[variant] ?? 'badge-neutral'} ${className}`}>
      {children}
    </span>
  )
}
