import { useMemo } from 'react'
import { getRankings, getSentiment, fmtPct, getBrandColor, getBrand } from '../utils/dataUtils.js'
import ConfidenceBadge from '../components/ConfidenceBadge.jsx'

function DeltaBadge({ delta, canCompare }) {
  if (!canCompare)
    return <span className="text-xs text-stone-400 italic">sample too small</span>
  if (delta == null)
    return <span className="text-xs text-stone-400">—</span>
  const pos   = delta > 0
  const zero  = delta === 0
  const color = zero ? 'text-stone-400' : pos ? 'text-emerald-600' : 'text-red-500'
  const icon  = zero ? '=' : pos ? '▲' : '▼'
  return (
    <span className={`text-xs font-semibold ${color} inline-flex items-center gap-0.5`} aria-label={`${pos ? 'Improved' : 'Declined'} by ${Math.abs(delta)}%`}>
      <span aria-hidden="true">{icon}</span>
      {zero ? '—' : `${Math.abs(delta).toFixed(1)}%`}
    </span>
  )
}

export default function Rankings({ allReviews, filtered, prevFiltered }) {
  const rankings = useMemo(() => getRankings(filtered, prevFiltered), [filtered, prevFiltered])

  // Most improved: only where both periods have n>=10
  const improved = useMemo(() =>
    rankings
      .filter(r => r.canCompare && r.delta !== null)
      .sort((a, b) => b.delta - a.delta),
    [rankings]
  )

  return (
    <div className="space-y-6">
      {/* Main rankings table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-stone-100">
          <h2 className="text-sm font-semibold text-stone-700">Location Rankings — Period</h2>
          <p className="text-xs text-stone-400 mt-0.5">Ranked by positive-review % in selected period. Δ vs previous equal-length period.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Location rankings">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide w-8">#</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Location</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Brand</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase tracking-wide">Positive %</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase tracking-wide">n</th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Confidence</th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-semibold text-stone-500 uppercase tracking-wide">vs Prev Period</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {rankings.map((row, idx) => {
                const lowConf = row.curConfidence.level < 3
                return (
                  <tr
                    key={row.name}
                    className={`hover:bg-stone-50 transition-colors ${lowConf ? 'opacity-60' : ''}`}
                  >
                    <td className="px-4 py-3 text-xs text-stone-400 font-medium">{idx + 1}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-stone-800 text-sm">{row.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className="inline-block text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: getBrandColor(row.brand) }}
                      >
                        {row.brand}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {row.curN === 0
                        ? <span className="text-stone-300 text-xs">—</span>
                        : (
                          <span className={`font-semibold ${lowConf ? 'text-stone-400' : 'text-stone-800'}`}>
                            {fmtPct(row.curPositive)}
                          </span>
                        )
                      }
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-stone-500">{row.curN}</td>
                    <td className="px-4 py-3">
                      <ConfidenceBadge n={row.curN} showLabel={false} />
                    </td>
                    <td className="px-4 py-3 text-right">
                      <DeltaBadge delta={row.delta} canCompare={row.canCompare} />
                      {row.canCompare && row.prevN > 0 && (
                        <p className="text-[10px] text-stone-400 mt-0.5 text-right">{fmtPct(row.prevPositive)} prev (n={row.prevN})</p>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Most improved */}
      {improved.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-1">Most Improved vs Previous Period</h2>
          <p className="text-xs text-stone-400 mb-4">Only locations where both periods have n≥10 are shown.</p>
          <div className="space-y-3">
            {improved.slice(0, 5).map(row => (
              <div key={row.name} className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-800 truncate">{row.name}</p>
                  <p className="text-xs text-stone-400">{fmtPct(row.prevPositive)} → {fmtPct(row.curPositive)}</p>
                </div>
                <DeltaBadge delta={row.delta} canCompare={true} />
              </div>
            ))}
          </div>
        </div>
      )}

      {improved.length === 0 && (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-6 text-center text-sm text-stone-400">
          Not enough data in both periods for period-over-period comparison (need n≥10 per location in each window).
        </div>
      )}
    </div>
  )
}
