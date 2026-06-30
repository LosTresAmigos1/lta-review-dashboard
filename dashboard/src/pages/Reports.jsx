import { useMemo } from 'react'
import { useWeeklyReport } from '../hooks/useWeeklyReport.js'
import { getBrand, getBrandColor, fmtRating } from '../utils/dataUtils.js'
import Card from '../components/ui/Card.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'

function KpiCard({ icon, value, label, sub, tone = 'amber' }) {
  const TONES = {
    amber:   'bg-amber-50 border-amber-200 text-amber-700',
    red:     'bg-red-50 border-red-200 text-red-700',
    emerald: 'bg-emerald-50 border-emerald-200 text-emerald-700',
    stone:   'bg-stone-50 border-stone-200 text-stone-600',
  }
  return (
    <div className={`rounded-xl border p-5 text-center ${TONES[tone]}`}>
      <p className="text-2xl mb-1" aria-hidden="true">{icon}</p>
      <p className="text-3xl font-bold tracking-tight">{value}</p>
      <p className="text-xs font-semibold uppercase tracking-wide mt-1.5">{label}</p>
      <p className="text-xs text-stone-400 mt-0.5">{sub}</p>
    </div>
  )
}

function TrendBadge({ cur, prev }) {
  if (cur == null) return <span className="text-xs text-stone-300">—</span>
  if (prev == null) return <span className="text-xs text-stone-400">First month</span>
  const delta = cur - prev
  if (delta >= 0.1) return <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">▲ +{delta.toFixed(2)}</span>
  if (delta <= -0.1) return <span className="text-xs font-semibold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">▼ {delta.toFixed(2)}</span>
  return <span className="text-xs text-stone-500 bg-stone-100 px-2 py-0.5 rounded-full">— Stable</span>
}

export default function Reports() {
  const { data, isLoading, isError } = useWeeklyReport()

  const locRows = useMemo(() => {
    if (!data) return []
    const names = new Set([...Object.keys(data.byLocation), ...Object.keys(data.avgNow)])
    return [...names].map(name => ({
      name,
      brand: getBrand(name),
      newCount: data.byLocation[name] || 0,
      avgNow: data.avgNow[name] ?? null,
      avgPrev: data.avgPrev[name] ?? null,
    })).sort((a, b) => b.newCount - a.newCount)
  }, [data])

  const { improving, declining } = useMemo(() => {
    if (!data) return { improving: 0, declining: 0 }
    let improving = 0, declining = 0
    for (const name of Object.keys(data.avgNow)) {
      const cur = data.avgNow[name], prev = data.avgPrev[name]
      if (prev == null) continue
      if (cur - prev >= 0.1) improving++
      else if (cur - prev <= -0.1) declining++
    }
    return { improving, declining }
  }, [data])

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full" />
        <div className="grid grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (isError || !data) {
    return <p className="text-sm text-red-600">Failed to load the weekly report.</p>
  }

  const trendTone = data.unanswered > 0 ? 'red' : 'emerald'
  const trendValue = data.unanswered > 0 ? data.unanswered : 'None'

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-stone-800">Weekly Review Report</h2>
        <p className="text-sm text-stone-500">{data.weekStr} · generated {new Date(data.generatedAt).toLocaleString()}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard icon="📊" value={data.totalNew} label="New Reviews" sub="This week" tone="amber" />
        <KpiCard icon={data.unanswered > 0 ? '⚠️' : '✅'} value={trendValue} label="Need Reply" sub={data.unanswered > 0 ? 'Unanswered 1–2★ lifetime' : 'All clear'} tone={trendTone} />
        <KpiCard
          icon={declining > 0 ? '📉' : improving > 0 ? '📈' : '📍'}
          value={declining > 0 ? declining : improving > 0 ? improving : locRows.length}
          label={declining > 0 ? 'Declining' : improving > 0 ? 'Improving' : 'Active'}
          sub="Locations vs prior 30 days"
          tone={declining > 0 ? 'red' : improving > 0 ? 'emerald' : 'stone'}
        />
      </div>

      {data.unanswered > 0 && (
        <Card className="border-red-200 bg-red-50 p-5">
          <p className="text-sm font-semibold text-red-800">Action Required</p>
          <p className="text-xs text-red-700 mt-1">
            You have <strong>{data.unanswered}</strong> unanswered 1–2 star review{data.unanswered !== 1 ? 's' : ''}.
            Responding to unhappy customers protects your reputation and improves your Google ranking. Aim to reply within 24 hours.
          </p>
        </Card>
      )}

      {data.totalNew === 0 && (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-stone-600">No new reviews this week</p>
          <p className="text-xs text-stone-400 mt-1">Consider running an update, or encourage satisfied customers to leave a review.</p>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-3 border-b border-stone-100">
          <h3 className="text-sm font-semibold text-stone-700">New Reviews by Location</h3>
          <p className="text-xs text-stone-400 mt-0.5">30-day average rating and trend vs. the prior 30 days.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Location</th>
                <th className="px-4 py-2.5 text-right text-xs font-semibold text-stone-500 uppercase tracking-wide">New Reviews</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">30-Day Rating</th>
                <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {locRows.map(row => (
                <tr key={row.name} className="hover:bg-stone-50">
                  <td className="px-4 py-2.5">
                    <p className="font-medium text-stone-800">{row.name}</p>
                    <span
                      className="inline-block text-[10px] font-semibold px-1.5 py-0.5 rounded-full text-white mt-0.5"
                      style={{ backgroundColor: getBrandColor(row.brand) }}
                    >{row.brand}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="font-semibold text-stone-800 bg-stone-100 px-2 py-0.5 rounded-full text-xs">{row.newCount}</span>
                  </td>
                  <td className="px-4 py-2.5 text-stone-600">{row.avgNow != null ? `${fmtRating(row.avgNow)} / 5.00` : <span className="text-stone-300">No data</span>}</td>
                  <td className="px-4 py-2.5"><TrendBadge cur={row.avgNow} prev={row.avgPrev} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {data.complaints.length > 0 && (
        <Card className="border-red-200 p-5">
          <h3 className="text-sm font-semibold text-stone-700 mb-1">Complaint Keywords This Week</h3>
          <p className="text-xs text-stone-400 mb-3">Most common words in this week's 1–2 star reviews.</p>
          <div className="flex flex-wrap gap-2">
            {data.complaints.map(([word, count]) => (
              <span key={word} className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-1.5">
                {word} <span className="opacity-50">×{count}</span>
              </span>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}
