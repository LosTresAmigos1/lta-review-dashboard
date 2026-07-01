export default function EmptyState({ icon, title, body, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {icon && (
        <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4"
             style={{ background: 'var(--color-surface-2)' }}>
          <span className="text-2xl">{icon}</span>
        </div>
      )}
      <p className="font-semibold text-sm mb-1" style={{ color: 'var(--color-text-1)' }}>{title}</p>
      {body && <p className="text-sm max-w-xs" style={{ color: 'var(--color-text-2)' }}>{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
