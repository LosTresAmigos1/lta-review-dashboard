export default function Skeleton({ className = '', lines, gap = 2 }) {
  if (lines) {
    return (
      <div className={`flex flex-col gap-${gap}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div key={i} className={`skeleton h-4 ${i === lines - 1 ? 'w-3/4' : 'w-full'} ${className}`} />
        ))}
      </div>
    )
  }
  return <div className={`skeleton ${className}`} />
}
