import { useMemo, useState } from 'react'
import { ResponsiveContainer, LineChart, Line, Tooltip } from 'recharts'
import { getLocationStats, fmtPct, fmtRating, getBrandColor, isUnverified } from '../utils/dataUtils.js'
import { extractInsights } from '../utils/textAnalysis.js'
import ConfidenceBadge from '../components/ConfidenceBadge.jsx'

const STAR_COLORS = ['#ef4444','#f97316','#fbbf24','#6ee7b7','#10b981']

function StarBar({ breakdown }) {
  const max = Math.max(...breakdown.map(d => d.count), 1)
  return (
    <div className="space-y-1">
      {[...breakdown].reverse().map(d => (
        <div key={d.star} className="flex items-center gap-2 text-xs">
          <span className="w-4 text-right text-stone-500">{d.star}★</span>
          <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${(d.count / max) * 100}%`, backgroundColor: STAR_COLORS[d.star - 1] }}
            />
          </div>
          <span className="w-6 text-right text-stone-500">{d.count}</span>
        </div>
      ))}
    </div>
  )
}

function Sparkline({ data }) {
  if (!data || data.length < 2) return <span className="text-xs text-stone-300">—</span>
  return (
    <ResponsiveContainer width={80} height={32}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line type="monotone" dataKey="avg" stroke="#d97706" strokeWidth={1.5} dot={false} connectNulls />
        <Tooltip
          content={({ active, payload }) =>
            active && payload?.length
              ? <div className="bg-white border border-stone-200 rounded text-xs px-2 py-1 shadow">{payload[0].payload.ym}: {payload[0].value}</div>
              : null
          }
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

function InsightChip({ label, count }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-stone-100 text-stone-700 text-xs font-medium px-2.5 py-1 rounded-full">
      {label}
      <span className="bg-stone-300 text-stone-600 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{count}</span>
    </span>
  )
}

function SnippetModal({ title, items, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title}>
      <div className="absolute inset-0 bg-stone-900/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b border-stone-100">
          <h3 className="font-semibold text-stone-800">{title}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="overflow-y-auto p-5 space-y-4">
          {items.map((r, i) => (
            <div key={i} className="bg-stone-50 rounded-lg p-3 text-sm">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-amber-500">{'★'.repeat(r.star_rating)}{'☆'.repeat(5 - r.star_rating)}</span>
                <span className="text-stone-400 text-xs">{r.review_date}</span>
                <span className="text-stone-500 text-xs">{r.reviewer_name}</span>
              </div>
              <p className="text-stone-700 leading-relaxed">{r.review_text || <em className="text-stone-400">No text</em>}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function InsightPanel({ reviews }) {
  const insights = useMemo(() => extractInsights(reviews), [reviews])
  const [modal, setModal] = useState(null)

  return (
    <div className="mt-4 space-y-4">
      {modal && <SnippetModal title={modal.title} items={modal.items} onClose={() => setModal(null)} />}

      {[
        { key: 'positiveThemes', label: '👍 Positive Themes', data: insights.positiveThemes, mapFn: d => ({ label: d.theme, count: d.count, items: d.reviews }) },
        { key: 'complaints',     label: '👎 Complaints',       data: insights.complaints,     mapFn: d => ({ label: d.theme, count: d.count, items: d.reviews }) },
        { key: 'staffNames',     label: '👤 Staff Mentioned',  data: insights.staffNames,     mapFn: d => ({ label: d.name,  count: d.count, items: d.reviews }) },
        { key: 'menuItems',      label: '🍽 Menu Mentions',    data: insights.menuItems,      mapFn: d => ({ label: d.item,  count: d.count, items: d.reviews }) },
      ].map(({ key, label, data, mapFn }) => (
        data.length > 0 && (
          <div key={key}>
            <p className="text-xs font-semibold text-stone-500 mb-2">{label}</p>
            <div className="flex flex-wrap gap-2">
              {data.map((d, i) => {
                const m = mapFn(d)
                return (
                  <button
                    key={i}
                    onClick={() => m.items.length > 0 && setModal({ title: m.label, items: m.items })}
                    className="hover:opacity-80 transition-opacity"
                    aria-label={`${m.label} — ${m.count} mentions`}
                    title="Click for supporting reviews"
                  >
                    <InsightChip label={m.label} count={m.count} />
                  </button>
                )
              })}
            </div>
          </div>
        )
      ))}
    </div>
  )
}

function LocationCard({ stat, periodReviews, isSelected, onSelect }) {
  const sent = stat.periodSentiment
  return (
    <article
      className={`bg-white border rounded-xl p-4 cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'border-amber-500 ring-2 ring-amber-200' : 'border-stone-200 hover:border-stone-300'
      }`}
      onClick={onSelect}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && onSelect()}
      aria-pressed={isSelected}
      aria-label={`${stat.name} — ${stat.lifetimeRating} stars lifetime`}
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <p className="font-semibold text-stone-800 text-sm leading-tight truncate">{stat.name}</p>
          <p className="text-xs text-stone-400 mt-0.5">{stat.city || '—'}</p>
        </div>
        <div className="flex flex-col items-end gap-1 flex-shrink-0">
          {stat.isUnverified && (
            <span className="inline-flex items-center gap-1 bg-orange-50 text-orange-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-orange-200">
              ⚠ Unverified
            </span>
          )}
          <span className="inline-block bg-stone-100 text-stone-600 text-[10px] font-semibold px-1.5 py-0.5 rounded-full">
            {stat.brand}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-2xl font-bold text-amber-600">{fmtRating(stat.lifetimeRating)}</p>
          <p className="text-xs text-stone-400">{stat.lifetimeCount.toLocaleString()} lifetime reviews</p>
        </div>
        <Sparkline data={stat.spark} />
      </div>

      <div className="border-t border-stone-100 pt-3 space-y-1.5">
        <ConfidenceBadge n={sent.n} />
        {sent.n > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-emerald-600 font-medium">{fmtPct(sent.positive)}</span>
            <span className="text-stone-300">|</span>
            <span className="text-yellow-600">{fmtPct(sent.neutral)}</span>
            <span className="text-stone-300">|</span>
            <span className="text-red-500">{fmtPct(sent.bad)}</span>
          </div>
        )}
      </div>
    </article>
  )
}

export default function LocationDetail({ allReviews, filtered }) {
  const [selectedLocation, setSelectedLocation] = useState(null)

  const stats = useMemo(() => getLocationStats(allReviews, filtered), [allReviews, filtered])
  const selectedStat = stats.find(s => s.name === selectedLocation)
  const locationReviews = useMemo(
    () => filtered.filter(r => r.location_name === selectedLocation),
    [filtered, selectedLocation]
  )

  function handleSelect(name) {
    setSelectedLocation(prev => prev === name ? null : name)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {stats.map(stat => (
          <LocationCard
            key={stat.name}
            stat={stat}
            periodReviews={filtered.filter(r => r.location_name === stat.name)}
            isSelected={selectedLocation === stat.name}
            onSelect={() => handleSelect(stat.name)}
          />
        ))}
      </div>

      {selectedStat && (
        <div className="bg-white border border-amber-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-stone-800">{selectedStat.name}</h2>
            <button
              onClick={() => setSelectedLocation(null)}
              className="text-stone-400 hover:text-stone-600 text-xl leading-none"
              aria-label="Close detail panel"
            >×</button>
          </div>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Star breakdown */}
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Period Star Breakdown</p>
              <StarBar breakdown={selectedStat.starBreakdown} />
              <div className="mt-3">
                <ConfidenceBadge n={selectedStat.periodSentiment.n} />
              </div>
            </div>

            {/* Sentiment */}
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Period Sentiment</p>
              {selectedStat.periodSentiment.n === 0
                ? <p className="text-sm text-stone-400">No reviews in selected period</p>
                : (
                  <div className="space-y-2">
                    {[
                      { label: 'Positive', val: selectedStat.periodSentiment.positive, n: selectedStat.periodSentiment.positiveN, color: 'bg-emerald-400' },
                      { label: 'Neutral',  val: selectedStat.periodSentiment.neutral,  n: selectedStat.periodSentiment.neutralN,  color: 'bg-yellow-400'  },
                      { label: 'Bad',      val: selectedStat.periodSentiment.bad,      n: selectedStat.periodSentiment.badN,      color: 'bg-red-400'     },
                    ].map(s => (
                      <div key={s.label} className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full ${s.color}`} aria-hidden="true" />
                        <span className="w-14 text-stone-600">{s.label}</span>
                        <div className="flex-1 bg-stone-100 rounded-full h-1.5">
                          <div className={`h-full ${s.color} rounded-full`} style={{ width: `${s.val}%` }} />
                        </div>
                        <span className="font-medium">{fmtPct(s.val)}</span>
                        <span className="text-stone-400">({s.n})</span>
                      </div>
                    ))}
                  </div>
                )
              }
            </div>

            {/* Trend sparkline */}
            <div>
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Rating Trend (6 mo)</p>
              {selectedStat.spark.length >= 2
                ? (
                  <ResponsiveContainer width="100%" height={80}>
                    <LineChart data={selectedStat.spark} margin={{ top: 4, right: 4, left: 4, bottom: 4 }}>
                      <Line type="monotone" dataKey="avg" stroke="#d97706" strokeWidth={2} dot={{ r: 3, fill: '#d97706' }} connectNulls />
                      <Tooltip
                        content={({ active, payload }) =>
                          active && payload?.length
                            ? <div className="bg-white border border-stone-200 rounded text-xs px-2 py-1 shadow">{payload[0].payload.ym}: {payload[0].value}★</div>
                            : null
                        }
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )
                : <p className="text-xs text-stone-400">Insufficient trend data</p>
              }
            </div>
          </div>

          {/* Insights */}
          <div className="mt-5 border-t border-stone-100 pt-5">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-1">
              Insights — period reviews (n={locationReviews.length})
            </p>
            {locationReviews.length === 0
              ? <p className="text-sm text-stone-400">No reviews in selected period for this location.</p>
              : <InsightPanel reviews={locationReviews} />
            }
          </div>
        </div>
      )}
    </div>
  )
}
