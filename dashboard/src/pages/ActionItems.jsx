import { useMemo, useState } from 'react'
import { extractInsights } from '../utils/textAnalysis.js'

function Stars({ n }) {
  return (
    <span className="flex gap-0.5">
      {[1,2,3,4,5].map(i => (
        <svg key={i} className={`w-3.5 h-3.5 ${i <= n ? 'text-amber-400' : 'text-stone-300'}`}
          fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  )
}

// ── Section 1: Unanswered negative reviews ─────────────────────────────────────
function UnansweredReviews({ allReviews }) {
  const [locFilter, setLocFilter] = useState('All')
  const [showAll, setShowAll]     = useState(false)

  const unanswered = useMemo(() =>
    allReviews
      .filter(r => Number(r.star_rating) <= 2 && !r.owner_response?.trim())
      .sort((a, b) => a.review_date.localeCompare(b.review_date)),
    [allReviews]
  )

  const locations = useMemo(() =>
    ['All', ...new Set(unanswered.map(r => r.location_name))].sort(),
    [unanswered]
  )

  const filtered = locFilter === 'All' ? unanswered : unanswered.filter(r => r.location_name === locFilter)
  const visible  = showAll ? filtered : filtered.slice(0, 15)

  const daysSince = date => {
    const diff = Date.now() - new Date(date).getTime()
    return Math.floor(diff / 86400000)
  }

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1 h-6 bg-red-500 rounded-full" />
        <h2 className="text-lg font-bold text-stone-800">Unanswered Negative Reviews</h2>
        <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
          {unanswered.length} need response
        </span>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        1–2 star reviews with no owner response, oldest first. Each unanswered review hurts your Google ranking.
      </p>

      {/* Location filter */}
      <div className="flex flex-wrap gap-2 mb-4">
        {locations.map(l => (
          <button key={l} onClick={() => { setLocFilter(l); setShowAll(false) }}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              locFilter === l
                ? 'bg-red-600 text-white border-red-600'
                : 'bg-white text-stone-600 border-stone-200 hover:border-red-400'
            }`}>
            {l === 'All' ? `All (${unanswered.length})` : `${l.replace('Los Tres Amigos ','LTA ').replace('Los Tres Mex Grill ','LTMG ')} (${unanswered.filter(r => r.location_name === l).length})`}
          </button>
        ))}
      </div>

      <div className="space-y-3">
        {visible.map((r, i) => {
          const days = daysSince(r.review_date)
          const urgency = days > 14 ? 'bg-red-50 border-red-200' : days > 7 ? 'bg-orange-50 border-orange-200' : 'bg-white border-stone-200'
          return (
            <div key={i} className={`rounded-xl border p-4 ${urgency}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-stone-800 text-sm">{r.reviewer_name || 'Anonymous'}</span>
                  <Stars n={Number(r.star_rating)} />
                  <span className="text-xs text-stone-400">{r.review_date}</span>
                  {days > 14 && <span className="text-xs bg-red-600 text-white px-2 py-0.5 rounded-full font-semibold">{days}d ago — urgent</span>}
                  {days > 7 && days <= 14 && <span className="text-xs bg-orange-500 text-white px-2 py-0.5 rounded-full font-semibold">{days}d ago</span>}
                </div>
              </div>
              <span className="inline-block text-xs bg-stone-100 text-stone-600 rounded-full px-2 py-0.5 mb-2">{r.location_name}</span>
              {r.review_text && <p className="text-sm text-stone-700 leading-relaxed">{r.review_text}</p>}
            </div>
          )
        })}
      </div>

      {filtered.length > 15 && !showAll && (
        <button onClick={() => setShowAll(true)}
          className="mt-4 w-full py-2 text-sm text-stone-500 border border-stone-200 rounded-lg hover:bg-stone-50 transition-colors">
          Show {filtered.length - 15} more
        </button>
      )}
      {filtered.length === 0 && (
        <div className="text-center py-12 text-stone-400">
          <div className="text-3xl mb-2">✓</div>
          <p>No unanswered negative reviews for this location.</p>
        </div>
      )}
    </section>
  )
}

// ── Section 2: Rating trend alerts ─────────────────────────────────────────────
function TrendAlerts({ allReviews }) {
  const alerts = useMemo(() => {
    const today   = new Date().toISOString().slice(0, 10)
    const d30     = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const d60     = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)

    const locs = [...new Set(allReviews.map(r => r.location_name))]
    return locs.map(loc => {
      const recent = allReviews.filter(r => r.location_name === loc && r.review_date >= d30 && r.review_date <= today)
      const prev   = allReviews.filter(r => r.location_name === loc && r.review_date >= d60 && r.review_date < d30)
      if (recent.length < 3 || prev.length < 3) return null

      const recentAvg = recent.reduce((s, r) => s + Number(r.star_rating), 0) / recent.length
      const prevAvg   = prev.reduce((s, r) => s + Number(r.star_rating), 0) / prev.length
      const delta     = recentAvg - prevAvg

      if (Math.abs(delta) < 0.15) return null
      return { loc, recentAvg, prevAvg, delta, recentCount: recent.length }
    })
    .filter(Boolean)
    .sort((a, b) => a.delta - b.delta)
  }, [allReviews])

  const dropping  = alerts.filter(a => a.delta < 0)
  const improving = alerts.filter(a => a.delta >= 0)

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1 h-6 bg-orange-500 rounded-full" />
        <h2 className="text-lg font-bold text-stone-800">Rating Trend Alerts</h2>
        <span className="text-xs text-stone-400">Last 30 days vs prior 30 days</span>
      </div>

      {alerts.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-6 text-center">
          <p className="text-emerald-700 font-semibold">All locations are stable — no significant rating changes detected.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {dropping.map((a, i) => (
            <div key={i} className="bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-stone-800 text-sm">{a.loc}</p>
                  <p className="text-xs text-stone-500">{a.recentCount} reviews in last 30 days</p>
                </div>
                <span className="text-red-600 font-bold text-lg">{a.delta.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="text-center">
                  <p className="text-xs text-stone-400">Before</p>
                  <p className="font-semibold text-stone-700">{a.prevAvg.toFixed(2)} ★</p>
                </div>
                <div className="text-red-400 text-lg">→</div>
                <div className="text-center">
                  <p className="text-xs text-stone-400">Now</p>
                  <p className="font-bold text-red-600">{a.recentAvg.toFixed(2)} ★</p>
                </div>
                <div className="ml-auto bg-red-100 text-red-700 text-xs font-bold px-2 py-1 rounded-full">
                  Dropping
                </div>
              </div>
            </div>
          ))}
          {improving.map((a, i) => (
            <div key={i} className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-stone-800 text-sm">{a.loc}</p>
                  <p className="text-xs text-stone-500">{a.recentCount} reviews in last 30 days</p>
                </div>
                <span className="text-emerald-600 font-bold text-lg">+{a.delta.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-3 text-sm">
                <div className="text-center">
                  <p className="text-xs text-stone-400">Before</p>
                  <p className="font-semibold text-stone-700">{a.prevAvg.toFixed(2)} ★</p>
                </div>
                <div className="text-emerald-400 text-lg">→</div>
                <div className="text-center">
                  <p className="text-xs text-stone-400">Now</p>
                  <p className="font-bold text-emerald-600">{a.recentAvg.toFixed(2)} ★</p>
                </div>
                <div className="ml-auto bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-1 rounded-full">
                  Improving
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Section 3: Recurring complaint keywords ────────────────────────────────────
function ComplaintKeywords({ allReviews }) {
  const [locFilter, setLocFilter] = useState('All')

  const locations = useMemo(() =>
    ['All', ...new Set(allReviews.map(r => r.location_name))].sort(),
    [allReviews]
  )

  const { complaints, positiveThemes } = useMemo(() => {
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    const base = locFilter === 'All'
      ? allReviews
      : allReviews.filter(r => r.location_name === locFilter)
    const recent = base.filter(r => r.review_date >= d90)
    return extractInsights(recent)
  }, [allReviews, locFilter])

  return (
    <section>
      <div className="flex items-center gap-3 mb-4">
        <div className="w-1 h-6 bg-violet-500 rounded-full" />
        <h2 className="text-lg font-bold text-stone-800">Recurring Complaint Keywords</h2>
        <span className="text-xs text-stone-400">Last 90 days · 1–2 star reviews</span>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        Words that appear most often in negative reviews — these reveal your biggest operational issues.
      </p>

      {/* Location filter */}
      <div className="flex flex-wrap gap-2 mb-5">
        {locations.slice(0, 8).map(l => (
          <button key={l} onClick={() => setLocFilter(l)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              locFilter === l
                ? 'bg-violet-600 text-white border-violet-600'
                : 'bg-white text-stone-600 border-stone-200 hover:border-violet-400'
            }`}>
            {l === 'All' ? 'All Locations' : l.replace('Los Tres Amigos ','LTA ').replace('Los Tres Mex Grill ','LTMG ')}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* Complaints */}
        <div>
          <h3 className="text-sm font-semibold text-red-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-red-500 rounded-full" />
            Top Complaints (1–2 stars)
          </h3>
          {complaints.length === 0 ? (
            <p className="text-stone-400 text-sm">Not enough negative reviews to detect patterns.</p>
          ) : (
            <div className="space-y-2">
              {complaints.slice(0, 8).map(({ theme, count, reviews: ex }, i) => (
                <div key={i} className="bg-red-50 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-stone-800 text-sm capitalize">{theme}</span>
                    <span className="text-xs bg-red-200 text-red-800 px-2 py-0.5 rounded-full font-bold">{count}×</span>
                  </div>
                  {ex[0]?.review_text && (
                    <p className="text-xs text-stone-500 italic line-clamp-2">
                      "{ex[0].review_text.slice(0, 120)}{ex[0].review_text.length > 120 ? '…' : ''}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* What customers love */}
        <div>
          <h3 className="text-sm font-semibold text-emerald-700 mb-3 flex items-center gap-2">
            <span className="w-2 h-2 bg-emerald-500 rounded-full" />
            What Customers Love (4–5 stars)
          </h3>
          {positiveThemes.length === 0 ? (
            <p className="text-stone-400 text-sm">Not enough positive reviews to detect patterns.</p>
          ) : (
            <div className="space-y-2">
              {positiveThemes.slice(0, 8).map(({ theme, count, reviews: ex }, i) => (
                <div key={i} className="bg-emerald-50 rounded-lg px-3 py-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-stone-800 text-sm capitalize">{theme}</span>
                    <span className="text-xs bg-emerald-200 text-emerald-800 px-2 py-0.5 rounded-full font-bold">{count}×</span>
                  </div>
                  {ex[0]?.review_text && (
                    <p className="text-xs text-stone-500 italic line-clamp-2">
                      "{ex[0].review_text.slice(0, 120)}{ex[0].review_text.length > 120 ? '…' : ''}"
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function ActionItems({ allReviews }) {
  const unansweredCount = useMemo(() =>
    allReviews.filter(r => Number(r.star_rating) <= 2 && !r.owner_response?.trim()).length,
    [allReviews]
  )

  return (
    <div className="space-y-10">
      <UnansweredReviews allReviews={allReviews} />
      <hr className="border-stone-200" />
      <TrendAlerts allReviews={allReviews} />
      <hr className="border-stone-200" />
      <ComplaintKeywords allReviews={allReviews} />
    </div>
  )
}

export function useUnansweredCount(allReviews) {
  return useMemo(() =>
    allReviews.filter(r => Number(r.star_rating) <= 2 && !r.owner_response?.trim()).length,
    [allReviews]
  )
}
