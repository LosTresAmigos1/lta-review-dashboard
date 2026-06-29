import { useState, useMemo } from 'react'
import allReviewsRaw from './data/reviews.json'
import Layout        from './components/Layout.jsx'
import GlobalFilters from './components/GlobalFilters.jsx'
import Overview      from './pages/Overview.jsx'
import LocationDetail from './pages/LocationDetail.jsx'
import ReviewExplorer from './pages/ReviewExplorer.jsx'
import Rankings      from './pages/Rankings.jsx'
import ActionItems, { useUnansweredCount } from './pages/ActionItems.jsx'
import Insights from './pages/Insights.jsx'
import {
  filterReviews, getDefaultDateRange, getDateBounds, ymLabel,
} from './utils/dataUtils.js'

// One-time sort by date ascending
const allReviews = [...allReviewsRaw].sort((a, b) => a.review_date.localeCompare(b.review_date))

function buildDefaultFilters(reviews) {
  const dr = getDefaultDateRange(reviews)
  return {
    brands:    [],
    locations: [],
    start:     dr.start,
    end:       dr.end,
    stars:     [],
    _defaultStart: dr.start,
    _defaultEnd:   dr.end,
  }
}

export default function App() {
  const [page,    setPage]    = useState('overview')
  const [filters, setFilters] = useState(() => buildDefaultFilters(allReviews))

  const filtered = useMemo(() => filterReviews(allReviews, filters), [filters])

  // Previous equal-length period for Rankings comparison
  const prevFiltered = useMemo(() => {
    if (!filters.start || !filters.end) return []
    const startMs = new Date(filters.start).getTime()
    const endMs   = new Date(filters.end).getTime()
    const lenMs   = endMs - startMs
    const prevEnd   = new Date(startMs - 1).toISOString().slice(0, 10)
    const prevStart = new Date(startMs - lenMs - 1).toISOString().slice(0, 10)
    return filterReviews(allReviews, { ...filters, start: prevStart, end: prevEnd })
  }, [filters])

  // Data window label for header
  const dataWindow = useMemo(() => {
    const { min, max } = getDateBounds(allReviews)
    if (!min || !max) return ''
    return `${min} — ${max}`
  }, [])

  // Period label for display
  const periodLabel = useMemo(() => {
    if (!filters.start || !filters.end) return 'All time'
    return `${filters.start} — ${filters.end}`
  }, [filters.start, filters.end])

  const unansweredCount = useUnansweredCount(allReviews)

  return (
    <Layout page={page} onPage={setPage} dataWindow={dataWindow} allReviews={allReviews} unansweredCount={unansweredCount}>
      {page !== 'actions' && page !== 'insights' && (
        <>
          <div className="mb-6">
            <GlobalFilters allReviews={allReviews} filters={filters} onChange={setFilters} />
          </div>
          <div className="mb-4 flex items-center gap-2">
            <span className="text-xs text-stone-400">Period:</span>
            <span className="text-xs font-medium text-stone-600 bg-stone-100 px-2 py-0.5 rounded-full">{periodLabel}</span>
            <span className="text-xs text-stone-400">·</span>
            <span className="text-xs text-stone-500">{filtered.length.toLocaleString()} reviews</span>
          </div>
        </>
      )}

      {page === 'overview'  && <Overview       allReviews={allReviews} filtered={filtered} />}
      {page === 'locations' && <LocationDetail allReviews={allReviews} filtered={filtered} />}
      {page === 'explorer'  && <ReviewExplorer allReviews={allReviews} filtered={filtered} />}
      {page === 'rankings'  && <Rankings       allReviews={allReviews} filtered={filtered} prevFiltered={prevFiltered} />}
      {page === 'actions'   && <ActionItems    allReviews={allReviews} />}
      {page === 'insights'  && <Insights       allReviews={allReviews} />}
    </Layout>
  )
}
