import { useState, useMemo, useEffect } from 'react'
import Layout        from './components/Layout.jsx'
import GlobalFilters from './components/GlobalFilters.jsx'
import Overview      from './pages/Overview.jsx'
import LocationDetail from './pages/LocationDetail.jsx'
import ReviewExplorer from './pages/ReviewExplorer.jsx'
import Rankings      from './pages/Rankings.jsx'
import ActionItems, { useUnansweredCount } from './pages/ActionItems.jsx'
import Insights from './pages/Insights.jsx'
import DataValidation from './pages/DataValidation.jsx'
import { useReviewsData } from './hooks/useReviewsData.js'
import {
  filterReviews, getDefaultDateRange, getDateBounds, ymLabel,
} from './utils/dataUtils.js'

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
  const { data: allReviews, isLoading, isError } = useReviewsData()
  const [page,    setPage]    = useState('overview')
  const [filters, setFilters] = useState(null)

  // Default filters depend on the loaded data's date bounds, so they're set
  // once the chunked fetch resolves rather than synchronously at import time.
  useEffect(() => {
    if (allReviews && !filters) setFilters(buildDefaultFilters(allReviews))
  }, [allReviews, filters])

  const filtered = useMemo(() => {
    if (!allReviews || !filters) return []
    return filterReviews(allReviews, filters)
  }, [allReviews, filters])

  // Previous equal-length period for Rankings comparison
  const prevFiltered = useMemo(() => {
    if (!allReviews || !filters || !filters.start || !filters.end) return []
    const startMs = new Date(filters.start).getTime()
    const endMs   = new Date(filters.end).getTime()
    const lenMs   = endMs - startMs
    const prevEnd   = new Date(startMs - 1).toISOString().slice(0, 10)
    const prevStart = new Date(startMs - lenMs - 1).toISOString().slice(0, 10)
    return filterReviews(allReviews, { ...filters, start: prevStart, end: prevEnd })
  }, [allReviews, filters])

  // Data window label for header
  const dataWindow = useMemo(() => {
    if (!allReviews) return ''
    const { min, max } = getDateBounds(allReviews)
    if (!min || !max) return ''
    return `${min} — ${max}`
  }, [allReviews])

  // Period label for display
  const periodLabel = useMemo(() => {
    if (!filters || !filters.start || !filters.end) return 'All time'
    return `${filters.start} — ${filters.end}`
  }, [filters])

  const unansweredCount = useUnansweredCount(allReviews || [])

  if (isLoading || !filters) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-stone-400 text-sm">Loading reviews…</p>
      </div>
    )
  }

  if (isError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50">
        <p className="text-red-600 text-sm">Failed to load review data.</p>
      </div>
    )
  }

  return (
    <Layout page={page} onPage={setPage} dataWindow={dataWindow} allReviews={allReviews} unansweredCount={unansweredCount}>
      {page !== 'actions' && page !== 'insights' && page !== 'validation' && (
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
      {page === 'validation' && <DataValidation allReviews={allReviews} />}
    </Layout>
  )
}
