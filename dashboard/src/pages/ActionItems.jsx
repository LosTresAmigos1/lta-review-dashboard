import { useMemo, useState, useCallback, useEffect } from 'react'
import ComplaintIntelligence from '../components/ComplaintIntelligence.jsx'

// ── Date windows ──────────────────────────────────────────────────────────────
const WINDOWS = [
  { key: '7d',  label: 'Last 7 Days',  days: 7   },
  { key: '30d', label: 'Last 30 Days', days: 30  },
  { key: '90d', label: 'Last 90 Days', days: 90  },
  { key: '1y',  label: 'Last Year',    days: 365 },
  { key: 'all', label: 'All Time',     days: null },
]
const DEFAULT_WINDOW = '90d'

// ── Priority scoring ──────────────────────────────────────────────────────────
function computePriority(review) {
  const stars   = Number(review.star_rating)
  const daysOld = Math.max(0, Math.floor(
    (Date.now() - new Date(review.review_date + 'T12:00:00').getTime()) / 86400000
  ))
  const ratingPts = { 1: 45, 2: 38, 3: 25, 4: 12, 5: 6 }[stars] ?? 6
  let recencyPts
  if      (daysOld <= 1)   recencyPts = 45
  else if (daysOld <= 3)   recencyPts = 40
  else if (daysOld <= 7)   recencyPts = 33
  else if (daysOld <= 14)  recencyPts = 25
  else if (daysOld <= 30)  recencyPts = 16
  else if (daysOld <= 90)  recencyPts = 8
  else if (daysOld <= 180) recencyPts = 4
  else if (daysOld <= 365) recencyPts = 2
  else                      recencyPts = 0
  const isLocalGuide   = (review.reviewer_name || '').toLowerCase().includes('local guide')
  const urgencyBonus   = stars <= 2 && daysOld <= 30 ? 6 : 0
  return Math.min(100, ratingPts + recencyPts + (isLocalGuide ? 8 : 0) + urgencyBonus)
}

const PRIORITY_TIERS = [
  { id: 'critical', label: '🔥 Respond First',   min: 75, dot: 'bg-red-500',    badge: 'bg-red-100 text-red-700',      card: 'border-red-200 bg-red-50/40'       },
  { id: 'high',     label: '🟠 High Priority',    min: 50, dot: 'bg-orange-500', badge: 'bg-orange-100 text-orange-700', card: 'border-orange-200 bg-orange-50/40' },
  { id: 'medium',   label: '🟡 Medium Priority',  min: 25, dot: 'bg-amber-400',  badge: 'bg-amber-100 text-amber-700',   card: 'border-amber-200 bg-amber-50/40'   },
  { id: 'low',      label: '🟢 Low Priority',     min: 0,  dot: 'bg-emerald-500',badge: 'bg-emerald-100 text-emerald-700',card: 'border-stone-200 bg-white'         },
]

function tierForScore(score) {
  for (const t of PRIORITY_TIERS) {
    if (score >= t.min) return t
  }
  return PRIORITY_TIERS[PRIORITY_TIERS.length - 1]
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function reviewKey(r) {
  return `${r.review_date}|${r.reviewer_name}|${r.location_name}`
}

function daysOld(r) {
  return Math.max(0, Math.floor(
    (Date.now() - new Date(r.review_date + 'T12:00:00').getTime()) / 86400000
  ))
}

function deadlineLabel(r) {
  const stars = Number(r.star_rating)
  const days  = daysOld(r)
  if (stars <= 2) {
    if (days === 0)    return { text: 'Respond today',        urgent: true  }
    if (days <= 3)     return { text: 'Respond ASAP',         urgent: true  }
    if (days <= 7)     return { text: `${days}d old — urgent`, urgent: true  }
    if (days <= 30)    return { text: `${days}d overdue`,      urgent: true  }
    return               { text: `${days}d waiting`,          urgent: false }
  }
  if (stars === 3) {
    if (days <= 7)     return { text: 'Respond this week',    urgent: false }
    return               { text: `${days}d waiting`,          urgent: false }
  }
  if (days <= 14)      return { text: 'Thank within 2 weeks', urgent: false }
  return                 { text: `${days}d waiting`,          urgent: false }
}

function shortLoc(name = '') {
  return name.replace('Los Tres Amigos ', 'LTA ').replace('Los Tres Mex Grill ', 'LTMG ')
}

function generateResponse(review) {
  const stars = Number(review.star_rating)
  const name  = (review.location_name || 'our restaurant')
    .replace('Los Tres Amigos ', '')
    .replace('Los Tres Mex Grill ', '')
  if (stars <= 2) {
    return `Thank you for sharing your feedback with us. We sincerely apologize that your recent visit to ${name} did not meet the standards we hold ourselves to. Your comments have been shared with our management team and will be addressed directly. We genuinely value your business and would love the opportunity to make this right. Please feel free to reach out to us at your convenience — we hope to earn back your trust.`
  }
  if (stars === 3) {
    return `Thank you for visiting ${name} and for taking the time to share your experience! We appreciate your honest feedback — it helps us improve. We're sorry your visit wasn't everything it could have been, and we'd love to have the chance to give you the experience you deserve. We hope to see you again soon!`
  }
  return `Thank you so much for the wonderful review! We're thrilled to hear that you enjoyed your experience at ${name}. Kind words like yours truly motivate our entire team. We look forward to welcoming you back soon — see you next time!`
}

// ── Stars ─────────────────────────────────────────────────────────────────────
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

// ── Response modal ────────────────────────────────────────────────────────────
function ResponseModal({ review, onClose, onMarkResponded }) {
  const [text, setText] = useState(() => generateResponse(review))
  const [copied, setCopied] = useState(false)

  const copy = useCallback(async () => {
    try { await navigator.clipboard.writeText(text) } catch { /* ignore */ }
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [text])

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-stone-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-stone-100">
          <div>
            <h3 className="font-bold text-stone-800">Generate Response</h3>
            <p className="text-xs text-stone-400 mt-0.5">
              {shortLoc(review.location_name)} · {review.reviewer_name} · {review.review_date}
            </p>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 transition-colors p-1" aria-label="Close">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Review snippet */}
        <div className="px-5 py-3 bg-stone-50 border-b border-stone-100">
          <div className="flex items-center gap-2 mb-1">
            <Stars n={Number(review.star_rating)} />
            <span className="text-xs text-stone-400">{review.reviewer_name || 'Anonymous'}</span>
            {(review.reviewer_name || '').toLowerCase().includes('local guide') && (
              <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded-full">Local Guide</span>
            )}
          </div>
          {review.review_text && (
            <p className="text-xs text-stone-600 italic leading-relaxed line-clamp-3">
              "{review.review_text}"
            </p>
          )}
        </div>

        {/* Editable response */}
        <div className="flex-1 overflow-y-auto p-5">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Your Response (editable)</p>
          <textarea
            className="w-full h-44 text-sm text-stone-700 border border-stone-200 rounded-xl p-3 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 leading-relaxed"
            value={text}
            onChange={e => setText(e.target.value)}
          />
          <p className="text-xs text-stone-400 mt-1.5">Edit as needed, then copy and paste into Google Business Profile.</p>
        </div>

        {/* Footer actions */}
        <div className="flex gap-2 px-5 pb-5 pt-2 border-t border-stone-100">
          <button
            onClick={copy}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              copied
                ? 'bg-emerald-500 text-white'
                : 'bg-amber-500 hover:bg-amber-600 text-white'
            }`}
          >
            {copied ? '✓ Copied!' : '📋 Copy Response'}
          </button>
          <button
            onClick={() => { onMarkResponded(); onClose() }}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-stone-200 text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Mark Responded
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Review card ───────────────────────────────────────────────────────────────
function ReviewCard({ review, priority, tier, onGenerateResponse, onMarkResponded, isResponded }) {
  const [expanded, setExpanded] = useState(false)
  const dl = deadlineLabel(review)
  const days = daysOld(review)
  const isLocalGuide = (review.reviewer_name || '').toLowerCase().includes('local guide')

  if (isResponded) return null

  return (
    <div className={`rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md ${tier.card}`}>
      {/* Top row */}
      <div className="flex items-start gap-3 mb-2">
        {/* Priority badge */}
        <div className="shrink-0 mt-0.5">
          <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${tier.badge}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${tier.dot}`} />
            {tier.label.replace(/^[^ ]+ /, '')}
          </span>
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-stone-800 text-sm">{review.reviewer_name || 'Anonymous'}</span>
            <Stars n={Number(review.star_rating)} />
            {isLocalGuide && (
              <span className="text-[10px] bg-blue-100 text-blue-700 font-semibold px-1.5 py-0.5 rounded-full">Local Guide</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-stone-400">{shortLoc(review.location_name)}</span>
            <span className="text-stone-200">·</span>
            <span className="text-xs text-stone-400">{review.review_date}</span>
          </div>
        </div>

        {/* Priority score + deadline */}
        <div className="shrink-0 text-right hidden sm:block">
          <div className="text-xs font-bold text-stone-700">Priority {priority}</div>
          <div className={`text-[10px] font-semibold mt-0.5 ${dl.urgent ? 'text-red-600' : 'text-stone-400'}`}>{dl.text}</div>
        </div>
      </div>

      {/* Deadline on mobile */}
      <div className={`sm:hidden text-[10px] font-semibold mb-2 ${dl.urgent ? 'text-red-600' : 'text-stone-400'}`}>{dl.text}</div>

      {/* Review text */}
      {review.review_text && (
        <div className="mt-1 mb-3">
          <p className={`text-sm text-stone-700 leading-relaxed ${expanded ? '' : 'line-clamp-3'}`}>
            {review.review_text}
          </p>
          {review.review_text.length > 200 && (
            <button onClick={() => setExpanded(e => !e)} className="text-xs text-amber-600 hover:text-amber-800 font-medium mt-1">
              {expanded ? 'Show less' : 'Read more'}
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2 border-t border-stone-100/60 flex-wrap">
        <button
          onClick={() => onGenerateResponse(review)}
          className="flex items-center gap-1.5 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg px-3 py-1.5 transition-colors"
        >
          ✍ Generate Response
        </button>
        <button
          onClick={() => onMarkResponded(reviewKey(review))}
          className="flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-800 border border-stone-200 hover:border-stone-400 rounded-lg px-3 py-1.5 transition-colors"
        >
          ✓ Mark Responded
        </button>
        {review.review_url && (
          <a
            href={review.review_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-stone-400 hover:text-stone-700 transition-colors"
          >
            Open on Google ↗
          </a>
        )}
      </div>
    </div>
  )
}

// ── Action Queue (main new section) ──────────────────────────────────────────
function ActionQueue({ allReviews }) {
  const [windowKey,   setWindowKey]   = useState(DEFAULT_WINDOW)
  const [locFilter,   setLocFilter]   = useState('All')
  const [showArchive, setShowArchive] = useState(false)
  const [modalReview, setModalReview] = useState(null)
  const [responded,   setResponded]   = useState(() => {
    try { return new Set(JSON.parse(localStorage.getItem('lta_responded') || '[]')) }
    catch { return new Set() }
  })

  const markResponded = useCallback(key => {
    setResponded(prev => {
      const next = new Set(prev)
      next.add(key)
      try { localStorage.setItem('lta_responded', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }, [])

  const windowDays = WINDOWS.find(w => w.key === windowKey)?.days ?? 90

  const cutoff = useMemo(() => {
    if (!windowDays) return null
    return new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10)
  }, [windowDays])

  const locations = useMemo(() =>
    ['All', ...Array.from(new Set(allReviews.map(r => r.location_name))).sort()],
    [allReviews]
  )

  // All unanswered reviews (excl. already responded via localStorage)
  const allUnanswered = useMemo(() =>
    allReviews.filter(r => !r.owner_response?.trim() && !responded.has(reviewKey(r))),
    [allReviews, responded]
  )

  const baseUnanswered = useMemo(() =>
    locFilter === 'All' ? allUnanswered : allUnanswered.filter(r => r.location_name === locFilter),
    [allUnanswered, locFilter]
  )

  // In-window reviews (needs attention)
  const inWindow = useMemo(() => {
    if (!cutoff) return baseUnanswered
    return baseUnanswered.filter(r => r.review_date >= cutoff)
  }, [baseUnanswered, cutoff])

  // Archived reviews (outside window)
  const archived = useMemo(() => {
    if (!cutoff) return []
    return baseUnanswered.filter(r => r.review_date < cutoff)
  }, [baseUnanswered, cutoff])

  // Prioritise + tag
  const scoredReviews = useMemo(() =>
    inWindow
      .map(r => ({ ...r, _score: computePriority(r) }))
      .sort((a, b) => b._score - a._score),
    [inWindow]
  )

  // Group by tier
  const groups = useMemo(() => {
    const result = {}
    PRIORITY_TIERS.forEach(t => { result[t.id] = [] })
    scoredReviews.forEach(r => {
      const tier = tierForScore(r._score)
      result[tier.id].push(r)
    })
    return result
  }, [scoredReviews])

  // Summary stats
  const stats = useMemo(() => {
    const neg    = inWindow.filter(r => Number(r.star_rating) <= 2)
    const today  = scoredReviews.filter(r => daysOld(r) === 0)
    const overdue = neg.filter(r => daysOld(r) > 14)
    const localGuides = inWindow.filter(r => (r.reviewer_name || '').toLowerCase().includes('local guide'))
    return { neg: neg.length, today: today.length, overdue: overdue.length, localGuides: localGuides.length }
  }, [inWindow, scoredReviews])

  // Smart recommendations
  const recommendations = useMemo(() => {
    const recs = []
    if (stats.neg > 0)         recs.push({ icon: '🔴', text: `${stats.neg} negative review${stats.neg > 1 ? 's' : ''} require a response.` })
    if (stats.overdue > 0)     recs.push({ icon: '⏰', text: `${stats.overdue} review${stats.overdue > 1 ? 's' : ''} ${stats.overdue > 1 ? 'have' : 'has'} been waiting over 14 days.` })
    if (stats.localGuides > 0) recs.push({ icon: '⭐', text: `${stats.localGuides} review${stats.localGuides > 1 ? 's' : ''} ${stats.localGuides > 1 ? 'are' : 'is'} from a Google Local Guide — high visibility.` })
    if (archived.length > 0)   recs.push({ icon: '📦', text: `${archived.length} older review${archived.length > 1 ? 's' : ''} archived outside this window.` })
    if (recs.length === 0 && inWindow.length === 0) recs.push({ icon: '✅', text: 'No unanswered reviews in this period — great work!' })
    return recs
  }, [stats, archived.length, inWindow.length])

  const hasModal = modalReview !== null

  return (
    <>
      {hasModal && (
        <ResponseModal
          review={modalReview}
          onClose={() => setModalReview(null)}
          onMarkResponded={() => markResponded(reviewKey(modalReview))}
        />
      )}

      <section>
        {/* Header */}
        <div className="flex items-center gap-3 mb-2">
          <div className="w-1 h-6 bg-red-500 rounded-full" />
          <h2 className="text-lg font-bold text-stone-800">Action Required</h2>
          {inWindow.length > 0 && (
            <span className="bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">
              {inWindow.length} need response
            </span>
          )}
        </div>
        <p className="text-sm text-stone-500 mb-5">
          Reviews sorted by priority score — a mix of star rating, age, and reviewer status. Respond first to the highest-scoring reviews.
        </p>

        {/* Date window filter */}
        <div className="flex gap-1.5 flex-wrap mb-5">
          {WINDOWS.map(w => (
            <button
              key={w.key}
              onClick={() => { setWindowKey(w.key); setShowArchive(false) }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors font-medium ${
                windowKey === w.key
                  ? 'bg-stone-800 text-white border-stone-800'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
              }`}
            >
              {w.label}
              {w.key === DEFAULT_WINDOW && windowKey !== DEFAULT_WINDOW ? '' : ''}
            </button>
          ))}
          <span className="text-xs text-stone-400 self-center ml-1">Default: 90 Days</span>
        </div>

        {/* Location filter */}
        <div className="flex gap-1.5 flex-wrap mb-5">
          {locations.slice(0, 12).map(l => (
            <button
              key={l}
              onClick={() => setLocFilter(l)}
              className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                locFilter === l
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-red-300'
              }`}
            >
              {l === 'All' ? 'All Locations' : shortLoc(l)}
            </button>
          ))}
        </div>

        {/* Dashboard cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Need Response ASAP',    value: (groups.critical?.length ?? 0) + (groups.high?.length ?? 0), color: 'text-red-600',    bg: 'bg-red-50',    border: 'border-red-200'    },
            { label: 'Negative Reviews',       value: stats.neg,                                                   color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-200' },
            { label: 'Overdue (14+ days)',     value: stats.overdue,                                               color: 'text-amber-700',  bg: 'bg-amber-50',  border: 'border-amber-200'  },
            { label: 'Archived',               value: archived.length,                                             color: 'text-stone-500',  bg: 'bg-stone-50',  border: 'border-stone-200'  },
          ].map(c => (
            <div key={c.label} className={`${c.bg} border ${c.border} rounded-2xl p-4 text-center`}>
              <p className={`text-2xl font-bold tabular-nums ${c.color}`}>{c.value}</p>
              <p className="text-xs text-stone-500 mt-0.5 leading-snug">{c.label}</p>
            </div>
          ))}
        </div>

        {/* Smart recommendations */}
        {recommendations.length > 0 && (
          <div className="bg-stone-900 rounded-2xl p-4 mb-6 space-y-2">
            {recommendations.map((r, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="shrink-0 text-base leading-5">{r.icon}</span>
                <span className="text-stone-300">{r.text}</span>
              </div>
            ))}
          </div>
        )}

        {/* Priority groups */}
        {inWindow.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-10 text-center">
            <div className="text-3xl mb-2">✓</div>
            <p className="text-emerald-700 font-semibold">No unanswered reviews in this period.</p>
            <p className="text-emerald-600 text-sm mt-1">Expand the window or check "All Time" to see older reviews.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {PRIORITY_TIERS.map(tier => {
              const tierReviews = groups[tier.id] || []
              if (tierReviews.length === 0) return null
              return (
                <div key={tier.id}>
                  <div className="flex items-center gap-2 mb-3">
                    <h3 className="text-sm font-bold text-stone-700">{tier.label}</h3>
                    <span className="text-xs text-stone-400">({tierReviews.length})</span>
                  </div>
                  <div className="space-y-3">
                    {tierReviews.map(r => (
                      <ReviewCard
                        key={reviewKey(r)}
                        review={r}
                        priority={r._score}
                        tier={tier}
                        onGenerateResponse={setModalReview}
                        onMarkResponded={markResponded}
                        isResponded={responded.has(reviewKey(r))}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Archived section */}
        {archived.length > 0 && (
          <div className="mt-8">
            <button
              onClick={() => setShowArchive(s => !s)}
              className="flex items-center gap-2 text-sm text-stone-500 hover:text-stone-800 border border-stone-200 hover:border-stone-400 rounded-xl px-4 py-2.5 transition-colors bg-white w-full"
            >
              <span>📦</span>
              <span className="font-medium">{showArchive ? 'Hide' : 'Show'} Archived Reviews ({archived.length})</span>
              <svg className={`w-4 h-4 ml-auto transition-transform ${showArchive ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {showArchive && (
              <div className="mt-4 space-y-3">
                <p className="text-xs text-stone-400">These reviews are outside your selected window and may not need immediate attention.</p>
                {archived
                  .map(r => ({ ...r, _score: computePriority(r) }))
                  .sort((a, b) => b._score - a._score)
                  .slice(0, 50)
                  .map(r => (
                    <ReviewCard
                      key={reviewKey(r)}
                      review={r}
                      priority={r._score}
                      tier={tierForScore(r._score)}
                      onGenerateResponse={setModalReview}
                      onMarkResponded={markResponded}
                      isResponded={responded.has(reviewKey(r))}
                    />
                  ))
                }
                {archived.length > 50 && (
                  <p className="text-xs text-stone-400 text-center py-2">
                    Showing 50 of {archived.length} archived reviews. Use "All Time" window to see all.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </section>
    </>
  )
}

// ── Rating trend alerts ────────────────────────────────────────────────────────
function TrendAlerts({ allReviews }) {
  const alerts = useMemo(() => {
    const d30 = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const d60 = new Date(Date.now() - 60 * 86400000).toISOString().slice(0, 10)
    const today = new Date().toISOString().slice(0, 10)
    const locs  = [...new Set(allReviews.map(r => r.location_name))]

    return locs.map(loc => {
      const all    = allReviews.filter(r => r.location_name === loc)
      const recent = all.filter(r => r.review_date >= d30 && r.review_date <= today)
      const prev   = all.filter(r => r.review_date >= d60 && r.review_date < d30)
      if (recent.length < 5 || prev.length < 5) return null

      const avg = arr => arr.reduce((s, r) => s + Number(r.star_rating), 0) / arr.length
      const recentAvg   = avg(recent)
      const prevAvg     = avg(prev)
      const lifetimeAvg = avg(all)
      const delta       = recentAvg - prevAvg
      if (Math.abs(delta) < 0.2) return null
      return { loc, recentAvg, prevAvg, lifetimeAvg, delta, recentCount: recent.length, prevCount: prev.length }
    })
    .filter(Boolean)
    .sort((a, b) => a.delta - b.delta)
  }, [allReviews])

  const dropping  = alerts.filter(a => a.delta < 0)
  const improving = alerts.filter(a => a.delta >= 0)

  return (
    <section>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1 h-6 bg-orange-500 rounded-full" />
        <h2 className="text-lg font-bold text-stone-800">Rating Trend Alerts</h2>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        Compares each location's <strong>last 30 days</strong> vs the <strong>30 days before that</strong>.
        This is NOT the overall Google rating — it highlights recent momentum shifts.
      </p>

      {alerts.length === 0 ? (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
          <p className="text-emerald-700 font-semibold">All locations are stable — no significant trend changes detected.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {dropping.map((a, i) => (
            <div key={i} className="bg-red-50 border border-red-200 rounded-2xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-stone-800 text-sm">{a.loc}</p>
                  <p className="text-xs text-stone-500 mt-0.5">Lifetime: <strong>{a.lifetimeAvg.toFixed(2)} ★</strong></p>
                </div>
                <span className="bg-red-100 text-red-700 font-bold text-sm px-2 py-1 rounded-lg">▼ {Math.abs(a.delta).toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-xl p-3 border border-red-100">
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wide font-semibold">31–60 days ago</p>
                  <p className="font-bold text-stone-700 text-lg">{a.prevAvg.toFixed(2)}</p>
                  <p className="text-[10px] text-stone-400">{a.prevCount} reviews</p>
                </div>
                <div className="text-red-300 text-xl">→</div>
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wide font-semibold">Last 30 days</p>
                  <p className="font-bold text-red-600 text-lg">{a.recentAvg.toFixed(2)}</p>
                  <p className="text-[10px] text-stone-400">{a.recentCount} reviews</p>
                </div>
              </div>
            </div>
          ))}
          {improving.map((a, i) => (
            <div key={i} className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="font-semibold text-stone-800 text-sm">{a.loc}</p>
                  <p className="text-xs text-stone-500 mt-0.5">Lifetime: <strong>{a.lifetimeAvg.toFixed(2)} ★</strong></p>
                </div>
                <span className="bg-emerald-100 text-emerald-700 font-bold text-sm px-2 py-1 rounded-lg">▲ {a.delta.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2 bg-white rounded-xl p-3 border border-emerald-100">
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wide font-semibold">31–60 days ago</p>
                  <p className="font-bold text-stone-700 text-lg">{a.prevAvg.toFixed(2)}</p>
                  <p className="text-[10px] text-stone-400">{a.prevCount} reviews</p>
                </div>
                <div className="text-emerald-300 text-xl">→</div>
                <div className="flex-1 text-center">
                  <p className="text-[10px] text-stone-400 uppercase tracking-wide font-semibold">Last 30 days</p>
                  <p className="font-bold text-emerald-600 text-lg">{a.recentAvg.toFixed(2)}</p>
                  <p className="text-[10px] text-stone-400">{a.recentCount} reviews</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// ── Complaint Intelligence wrapper (90-day window) ────────────────────────────
function VoiceOfCustomer({ allReviews }) {
  const d90  = useMemo(() => new Date(Date.now() - 90  * 86400000).toISOString().slice(0, 10), [])
  const d180 = useMemo(() => new Date(Date.now() - 180 * 86400000).toISOString().slice(0, 10), [])

  const current  = useMemo(() => allReviews.filter(r => r.review_date >= d90),                       [allReviews, d90])
  const previous = useMemo(() => allReviews.filter(r => r.review_date >= d180 && r.review_date < d90), [allReviews, d90, d180])

  return (
    <ComplaintIntelligence
      reviews={current}
      prevReviews={previous}
      title="Voice of the Customer"
      showSummaryCard={true}
    />
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ActionItems({ allReviews }) {
  return (
    <div className="space-y-10">
      <ActionQueue   allReviews={allReviews} />
      <hr className="border-stone-200" />
      <TrendAlerts   allReviews={allReviews} />
      <hr className="border-stone-200" />
      <VoiceOfCustomer allReviews={allReviews} />
    </div>
  )
}

export function useUnansweredCount(allReviews) {
  return useMemo(() => {
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    return allReviews.filter(r =>
      Number(r.star_rating) <= 2 &&
      !r.owner_response?.trim() &&
      r.review_date >= d90
    ).length
  }, [allReviews])
}
