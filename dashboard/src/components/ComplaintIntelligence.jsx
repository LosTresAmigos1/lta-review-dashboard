import { useMemo, useState } from 'react'
import { buildCategorySummary, generateVocSummary, COMPLAINT_CATEGORIES, PRAISE_CATEGORIES } from '../utils/textAnalysis.js'

// ── Helpers ───────────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { label: 'Critical', dot: 'bg-red-500',    text: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200',    ring: 'ring-red-200'    },
  high:     { label: 'High',     dot: 'bg-orange-500', text: 'text-orange-700', bg: 'bg-orange-50', border: 'border-orange-200', ring: 'ring-orange-200' },
  medium:   { label: 'Medium',   dot: 'bg-amber-500',  text: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200',  ring: 'ring-amber-200'  },
  low:      { label: 'Low',      dot: 'bg-emerald-500',text: 'text-emerald-700',bg: 'bg-emerald-50',border: 'border-emerald-200',ring: 'ring-emerald-200'},
}

function SeverityBadge({ severity }) {
  const c = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.low
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full border ${c.bg} ${c.border} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {c.label}
    </span>
  )
}

function TrendBadge({ trend, prevCount, isPositive = false }) {
  if (trend === 'new') {
    return <span className="text-[10px] font-bold text-violet-600 bg-violet-50 border border-violet-200 px-2 py-1 rounded-full">NEW</span>
  }
  if (trend === 'stable') {
    return <span className="text-[10px] font-bold text-stone-500 bg-stone-100 border border-stone-200 px-2 py-1 rounded-full">→ Stable</span>
  }
  const improving = isPositive ? trend === 'up' : trend === 'down'
  if (improving) {
    return <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-full">↓ Improving</span>
  }
  return <span className="text-[10px] font-bold text-red-700 bg-red-50 border border-red-200 px-2 py-1 rounded-full">↑ Increasing</span>
}

function shortName(name) {
  return (name || '')
    .replace('Los Tres Amigos ', 'LTA ')
    .replace('Los Tres Mex Grill ', 'LTMG ')
}

// ── Category card ─────────────────────────────────────────────────────────────

function CategoryCard({ cat, rank, total, isPositive = false }) {
  const [open, setOpen] = useState(false)
  const pct = total > 0 ? Math.round((cat.count / total) * 100) : 0
  const sc = SEVERITY_CONFIG[cat.severity] || SEVERITY_CONFIG.low

  return (
    <div className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-shadow hover:shadow-md ${open ? 'border-stone-300' : 'border-stone-200'}`}>
      {/* Header row */}
      <button
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-stone-50 transition-colors"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {/* Rank */}
        <span className="text-xl font-bold text-stone-200 w-7 shrink-0 select-none">#{rank}</span>

        {/* Icon + label */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg leading-none">{cat.icon}</span>
            <p className="font-semibold text-stone-800 text-sm">{cat.label}</p>
            {!isPositive && <SeverityBadge severity={cat.severity} />}
            <TrendBadge trend={cat.trend} prevCount={cat.prevCount} isPositive={isPositive} />
          </div>
          {cat.topLocations.length > 0 && (
            <p className="text-xs text-stone-400 mt-0.5 truncate">
              {cat.topLocations.slice(0, 3).map(l => shortName(l.name)).join(' · ')}
            </p>
          )}
        </div>

        {/* Count */}
        <div className="shrink-0 text-right mr-2">
          <p className="text-xl font-bold text-stone-800 tabular-nums">{cat.count}</p>
          <p className="text-[10px] text-stone-400">{pct}% of reviews</p>
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 text-stone-400 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Progress bar */}
      <div className="h-1 bg-stone-100">
        <div
          className={`h-full transition-all duration-500 ${isPositive ? 'bg-emerald-400' : (cat.severity === 'critical' ? 'bg-red-500' : cat.severity === 'high' ? 'bg-orange-400' : 'bg-amber-400')}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Expandable body */}
      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-stone-100 space-y-4">
          {/* Location breakdown */}
          {cat.topLocations.length > 0 && (
            <div>
              <p className="text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-2">Most Affected Locations</p>
              <div className="flex flex-wrap gap-2">
                {cat.topLocations.map(loc => (
                  <span
                    key={loc.name}
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-700 bg-stone-100 border border-stone-200 px-2.5 py-1 rounded-full"
                  >
                    {shortName(loc.name)}
                    <span className="text-stone-500 font-bold">{loc.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Example reviews */}
          {cat.examples.length > 0 && (
            <div>
              <p className="text-[10px] font-bold tracking-widest text-stone-400 uppercase mb-2">Example Reviews</p>
              <div className="space-y-2.5">
                {cat.examples.map((r, i) => (
                  <div key={i} className="bg-stone-50 rounded-xl p-3 border border-stone-100">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="text-amber-500 text-xs">{'★'.repeat(Number(r.star_rating))}{'☆'.repeat(5 - Number(r.star_rating))}</span>
                      <span className="text-[10px] font-medium text-stone-500">{shortName(r.location_name)}</span>
                      {r.review_date && <span className="text-[10px] text-stone-400">{r.review_date}</span>}
                    </div>
                    <p className="text-xs text-stone-700 leading-relaxed italic">
                      "{(r.review_text || '').slice(0, 240)}{(r.review_text || '').length > 240 ? '…' : ''}"
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Tab button ────────────────────────────────────────────────────────────────

function Tab({ active, onClick, children, count, color = 'amber' }) {
  const activeColors = color === 'red'
    ? 'bg-red-600 text-white border-red-600'
    : 'bg-emerald-600 text-white border-emerald-600'
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
        active ? activeColors : 'text-stone-600 border-stone-200 bg-white hover:border-stone-300'
      }`}
    >
      {children}
      {count != null && (
        <span className={`text-xs font-bold rounded-full min-w-[20px] h-5 flex items-center justify-center px-1 ${
          active ? 'bg-white/20' : 'bg-stone-100 text-stone-500'
        }`}>{count}</span>
      )}
    </button>
  )
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function ComplaintIntelligence({ reviews, prevReviews = [], title = 'Complaint Intelligence', showSummaryCard = true }) {
  const [activeTab, setActiveTab] = useState('complaints')
  const [locFilter, setLocFilter] = useState('All')
  const [showAll, setShowAll] = useState(false)

  const locations = useMemo(() =>
    ['All', ...Array.from(new Set(reviews.map(r => r.location_name))).sort()],
    [reviews]
  )

  const { base, prevBase } = useMemo(() => {
    const f = loc => loc === 'All' ? r => true : r => r.location_name === loc
    return {
      base:     reviews.filter(f(locFilter)),
      prevBase: prevReviews.filter(f(locFilter)),
    }
  }, [reviews, prevReviews, locFilter])

  const negCurrent  = useMemo(() => base.filter(r => Number(r.star_rating) <= 2), [base])
  const negPrev     = useMemo(() => prevBase.filter(r => Number(r.star_rating) <= 2), [prevBase])
  const posCurrent  = useMemo(() => base.filter(r => Number(r.star_rating) >= 4), [base])
  const posPrev     = useMemo(() => prevBase.filter(r => Number(r.star_rating) >= 4), [prevBase])

  const complaints = useMemo(() => buildCategorySummary(negCurrent, COMPLAINT_CATEGORIES, negPrev, 2), [negCurrent, negPrev])
  const praise     = useMemo(() => buildCategorySummary(posCurrent, PRAISE_CATEGORIES,     posPrev, 2), [posCurrent, posPrev])

  const summary = useMemo(() =>
    generateVocSummary(complaints, praise, negCurrent.length, posCurrent.length),
    [complaints, praise, negCurrent.length, posCurrent.length]
  )

  const activeList  = activeTab === 'complaints' ? complaints : praise
  const isPositive  = activeTab === 'praise'
  const visibleList = showAll ? activeList : activeList.slice(0, 6)

  const criticalCount = complaints.filter(c => c.severity === 'critical' || c.severity === 'high').length

  return (
    <section>
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1 h-6 bg-violet-500 rounded-full" />
        <h2 className="text-lg font-bold text-stone-800">{title}</h2>
      </div>

      {/* Summary card */}
      {showSummaryCard && (
        <div className="bg-stone-900 text-white rounded-2xl p-5 mb-6">
          <p className="text-[10px] font-bold tracking-[0.2em] text-amber-400 uppercase mb-3">Voice of the Customer — AI Analysis</p>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div>
              <p className="text-2xl font-bold text-red-400 tabular-nums">{negCurrent.length}</p>
              <p className="text-xs text-stone-400 mt-0.5">Negative reviews analyzed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-400 tabular-nums">{complaints.length}</p>
              <p className="text-xs text-stone-400 mt-0.5">Distinct issues found</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-emerald-400 tabular-nums">{posCurrent.length}</p>
              <p className="text-xs text-stone-400 mt-0.5">Positive reviews analyzed</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-amber-400 tabular-nums">{praise.length}</p>
              <p className="text-xs text-stone-400 mt-0.5">Praise themes found</p>
            </div>
          </div>

          {/* Summary text */}
          <p className="text-sm text-stone-300 leading-relaxed border-t border-stone-700 pt-4">{summary}</p>

          {/* Critical/high alert */}
          {criticalCount > 0 && (
            <div className="mt-3 flex items-center gap-2 text-xs text-red-300 bg-red-950/40 border border-red-800/40 rounded-xl px-3 py-2">
              <span className="text-red-400">⚠</span>
              {criticalCount} issue{criticalCount > 1 ? 's' : ''} rated Critical or High — immediate attention recommended.
            </div>
          )}
        </div>
      )}

      {/* Location filter */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {locations.slice(0, 12).map(l => (
          <button
            key={l}
            onClick={() => setLocFilter(l)}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
              locFilter === l
                ? 'bg-stone-800 text-white border-stone-800'
                : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
            }`}
          >
            {l === 'All' ? 'All Locations' : shortName(l)}
          </button>
        ))}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 mb-5">
        <Tab active={activeTab === 'complaints'} onClick={() => { setActiveTab('complaints'); setShowAll(false) }} count={complaints.length} color="red">
          🔴 Issues &amp; Complaints
        </Tab>
        <Tab active={activeTab === 'praise'} onClick={() => { setActiveTab('praise'); setShowAll(false) }} count={praise.length} color="green">
          ⭐ What Customers Love
        </Tab>
      </div>

      {/* Context line */}
      <p className="text-xs text-stone-400 mb-4">
        {isPositive
          ? `Analyzing ${posCurrent.length} reviews with 4–5 stars. Categories are grouped by semantic theme — not individual words.`
          : `Analyzing ${negCurrent.length} reviews with 1–2 stars. Each review may belong to multiple issue categories.`
        }
        {prevBase.length > 0 && ' Trends compare to the previous equal-length period.'}
      </p>

      {/* Category list */}
      {activeList.length === 0 ? (
        <div className="bg-stone-50 border border-stone-200 rounded-2xl p-10 text-center">
          <p className="text-stone-500 font-medium">
            {isPositive
              ? 'Not enough positive reviews in this period to detect patterns.'
              : 'Not enough negative reviews in this period to detect patterns.'}
          </p>
          <p className="text-sm text-stone-400 mt-1">Try selecting "All Locations" or expanding the date range.</p>
        </div>
      ) : (
        <>
          <div className="space-y-3">
            {visibleList.map((cat, i) => (
              <CategoryCard
                key={cat.id}
                cat={cat}
                rank={i + 1}
                total={isPositive ? posCurrent.length : negCurrent.length}
                isPositive={isPositive}
              />
            ))}
          </div>

          {activeList.length > 6 && (
            <button
              className="mt-4 w-full text-sm text-stone-500 hover:text-stone-800 border border-stone-200 hover:border-stone-400 rounded-xl py-2.5 transition-colors bg-white"
              onClick={() => setShowAll(s => !s)}
            >
              {showAll
                ? 'Show less'
                : `Show ${activeList.length - 6} more ${isPositive ? 'praise themes' : 'issue categories'}`
              }
            </button>
          )}
        </>
      )}
    </section>
  )
}
