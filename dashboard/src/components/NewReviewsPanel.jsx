import { useState, useEffect, useMemo } from 'react'

const STORAGE_KEY = 'lta_last_checked'

function getLastChecked() {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) return stored
  // Default: show last 7 days on first visit
  const d = new Date()
  d.setDate(d.getDate() - 7)
  return d.toISOString().slice(0, 10)
}

function Stars({ n }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <svg key={i} className={`w-4 h-4 ${i <= n ? 'text-amber-400' : 'text-stone-300'}`}
          fill="currentColor" viewBox="0 0 20 20">
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </span>
  )
}

function ReviewCard({ review }) {
  const [expanded, setExpanded] = useState(false)
  const text = review.review_text || ''
  const short = text.length > 220

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2 mb-1">
        <div>
          <p className="font-semibold text-stone-800 text-sm">{review.reviewer_name || 'Anonymous'}</p>
          <p className="text-xs text-stone-400">{review.review_date}</p>
        </div>
        <Stars n={Number(review.star_rating) || 0} />
      </div>

      <span className="inline-block text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5 mb-2">
        {review.location_name}
      </span>

      {text && (
        <p className="text-sm text-stone-700 leading-relaxed">
          {short && !expanded ? text.slice(0, 220) + '…' : text}
          {short && (
            <button onClick={() => setExpanded(e => !e)}
              className="ml-1 text-amber-600 hover:text-amber-700 font-medium text-xs">
              {expanded ? 'Less' : 'More'}
            </button>
          )}
        </p>
      )}

      {review.owner_response && (
        <div className="mt-3 pl-3 border-l-2 border-amber-300 bg-amber-50 rounded-r-lg p-2">
          <p className="text-xs font-semibold text-amber-800 mb-0.5">Owner response</p>
          <p className="text-xs text-amber-900 leading-relaxed line-clamp-3">{review.owner_response}</p>
        </div>
      )}
    </div>
  )
}

export default function NewReviewsPanel({ allReviews }) {
  const [open, setOpen]           = useState(false)
  const [lastChecked, setLastChecked] = useState(getLastChecked)
  const [filterStar, setFilterStar]   = useState(0)

  const newReviews = useMemo(() => {
    return [...allReviews]
      .filter(r => r.review_date > lastChecked)
      .sort((a, b) => b.review_date.localeCompare(a.review_date))
  }, [allReviews, lastChecked])

  const displayed = filterStar
    ? newReviews.filter(r => Number(r.star_rating) === filterStar)
    : newReviews

  function handleOpen() {
    setOpen(true)
  }

  function handleClose() {
    const today = new Date().toISOString().slice(0, 10)
    localStorage.setItem(STORAGE_KEY, today)
    setLastChecked(today)
    setOpen(false)
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return
    const handler = e => { if (e.key === 'Escape') handleClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open])

  const count = newReviews.length

  return (
    <>
      {/* Bell button */}
      <button
        onClick={handleOpen}
        className="relative flex items-center gap-1.5 bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold px-3 py-1.5 rounded-full transition-colors shadow"
        title="Check new reviews"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        New Reviews
        {count > 0 && (
          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 shadow">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {/* Backdrop */}
      {open && (
        <div className="fixed inset-0 bg-black/40 z-40 backdrop-blur-sm"
          onClick={handleClose} />
      )}

      {/* Slide-in panel */}
      <div className={`fixed top-0 right-0 h-full w-full sm:w-[480px] bg-stone-50 z-50 shadow-2xl flex flex-col transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Panel header */}
        <div className="bg-stone-900 text-white px-5 py-4 flex items-start justify-between">
          <div>
            <h2 className="text-base font-bold">New Reviews</h2>
            <p className="text-xs text-stone-400 mt-0.5">
              Since {lastChecked} · {count} review{count !== 1 ? 's' : ''}
            </p>
          </div>
          <button onClick={handleClose}
            className="text-stone-400 hover:text-white transition-colors mt-0.5"
            aria-label="Close panel">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Star filter */}
        <div className="px-5 py-3 border-b border-stone-200 bg-white flex items-center gap-2 flex-wrap">
          <span className="text-xs text-stone-500 font-medium">Filter:</span>
          {[0, 1, 2, 3, 4, 5].map(s => (
            <button key={s}
              onClick={() => setFilterStar(s)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                filterStar === s
                  ? 'bg-amber-500 text-white border-amber-500'
                  : 'bg-white text-stone-600 border-stone-200 hover:border-amber-400'
              }`}>
              {s === 0 ? 'All' : `${'★'.repeat(s)}`}
            </button>
          ))}
          <span className="ml-auto text-xs text-stone-400">{displayed.length} shown</span>
        </div>

        {/* Reviews list */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          {displayed.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl mb-3">🎉</div>
              <p className="text-stone-600 font-medium">You're all caught up!</p>
              <p className="text-stone-400 text-sm mt-1">
                {count === 0
                  ? 'No new reviews since your last check.'
                  : 'No reviews match this star filter.'}
              </p>
            </div>
          ) : (
            displayed.map((r, i) => <ReviewCard key={i} review={r} />)
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-stone-200 px-5 py-3 bg-white">
          <button onClick={handleClose}
            className="w-full bg-stone-800 hover:bg-stone-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors">
            Mark all as seen
          </button>
        </div>
      </div>
    </>
  )
}
