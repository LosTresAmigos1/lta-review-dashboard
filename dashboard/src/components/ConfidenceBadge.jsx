export default function ConfidenceBadge({ n, showLabel = true }) {
  const cfg =
    n === 0  ? { dot: 'bg-stone-300',   text: 'text-stone-400',   label: 'Insufficient data' } :
    n < 5    ? { dot: 'bg-orange-400',  text: 'text-orange-500',  label: 'Low confidence'    } :
    n < 10   ? { dot: 'bg-yellow-400',  text: 'text-yellow-600',  label: 'Moderate'           } :
               { dot: 'bg-emerald-400', text: 'text-emerald-600', label: 'Good'               }

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${cfg.text}`} title={`n=${n}`}>
      <span className={`inline-block w-1.5 h-1.5 rounded-full ${cfg.dot}`} aria-hidden="true" />
      {showLabel ? cfg.label : null}
      <span className="font-normal opacity-70">(n={n})</span>
    </span>
  )
}
