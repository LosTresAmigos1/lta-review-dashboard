import { useMemo, useEffect, useState } from 'react'
import { Routes, Route, Navigate, Outlet, useLocation, useOutletContext } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import Layout        from './components/Layout.jsx'
import GlobalFilters from './components/GlobalFilters.jsx'
import Skeleton       from './components/ui/Skeleton.jsx'
import Overview      from './pages/Overview.jsx'
import LocationDetail from './pages/LocationDetail.jsx'
import ReviewExplorer from './pages/ReviewExplorer.jsx'
import TrendsAnalytics from './pages/TrendsAnalytics.jsx'
import ActionItems, { useUnansweredCount } from './pages/ActionItems.jsx'
import ScraperStatus from './pages/ScraperStatus.jsx'
import Reports from './pages/Reports.jsx'
import { useReviewsData } from './hooks/useReviewsData.js'
import {
  filterReviews, getDefaultDateRange, getDateBounds, ymLabel,
} from './utils/dataUtils.js'

// Routes that don't use the shared GlobalFilters bar (they operate on the
// full lifetime dataset, or a fixed trailing-7-day window, rather than the
// global filterable period).
const NO_FILTER_BAR_PATHS = ['/actions', '/scraper-status', '/reports']

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

function RootLayout() {
  const { data: allReviews, isLoading, isError } = useReviewsData()
  const [filters, setFilters] = useState(null)
  const location = useLocation()

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
        <div className="w-64 space-y-3">
          <Skeleton className="h-4 w-40 mx-auto" />
          <Skeleton className="h-3 w-56 mx-auto" />
        </div>
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

  const showFilterBar = !NO_FILTER_BAR_PATHS.includes(location.pathname)

  return (
    <Layout dataWindow={dataWindow} allReviews={allReviews} unansweredCount={unansweredCount}>
      {showFilterBar && (
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

      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15 }}
        >
          <Outlet context={{ allReviews, filtered, prevFiltered, filters }} />
        </motion.div>
      </AnimatePresence>
    </Layout>
  )
}

export default function App() {
  return (
    <Routes>
      <Route element={<RootLayout />}>
        <Route index element={<Navigate to="/overview" replace />} />
        <Route path="overview"       element={<RouteOverview />} />
        <Route path="locations"      element={<RouteLocations />} />
        <Route path="explorer"       element={<RouteExplorer />} />
        <Route path="actions"        element={<RouteActions />} />
        <Route path="trends"         element={<RouteTrends />} />
        <Route path="scraper-status" element={<RouteScraperStatus />} />
        <Route path="reports"        element={<Reports />} />
        {/* Legacy paths from the pre-Milestone-5 nav — redirect to their new merged homes */}
        <Route path="rankings"   element={<Navigate to="/trends" replace />} />
        <Route path="insights"   element={<Navigate to="/trends" replace />} />
        <Route path="validation" element={<Navigate to="/scraper-status" replace />} />
        <Route path="*" element={<Navigate to="/overview" replace />} />
      </Route>
    </Routes>
  )
}

function RouteOverview()      { const { allReviews, filtered } = useOutletContext(); return <Overview allReviews={allReviews} filtered={filtered} /> }
function RouteLocations()     { const { allReviews, filtered, filters } = useOutletContext(); return <LocationDetail allReviews={allReviews} filtered={filtered} filters={filters} /> }
function RouteExplorer()      { const { allReviews, filtered } = useOutletContext(); return <ReviewExplorer allReviews={allReviews} filtered={filtered} /> }
function RouteTrends()        { const { allReviews, filtered, prevFiltered } = useOutletContext(); return <TrendsAnalytics allReviews={allReviews} filtered={filtered} prevFiltered={prevFiltered} /> }
function RouteActions()       { const { allReviews } = useOutletContext(); return <ActionItems allReviews={allReviews} /> }
function RouteScraperStatus() { const { allReviews } = useOutletContext(); return <ScraperStatus allReviews={allReviews} /> }
