import { useState, useEffect } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import NewReviewsPanel from './NewReviewsPanel.jsx'

const TABS = [
  { id: 'overview',  path: '/overview',        label: 'Overview'           },
  { id: 'locations', path: '/locations',        label: 'Locations'          },
  { id: 'explorer',  path: '/explorer',         label: 'All Reviews'        },
  { id: 'actions',   path: '/actions',          label: 'Needs Attention'    },
  { id: 'trends',    path: '/trends',           label: 'Trends & Analytics' },
  { id: 'scraper',   path: '/scraper-status',   label: 'Scraper Status'     },
  { id: 'reports',   path: '/reports',          label: 'Reports'            },
]

export default function Layout({ dataWindow, allReviews, unansweredCount, children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  // Close drawer on route change
  useEffect(() => { setMobileOpen(false) }, [location.pathname])
  // Lock body scroll while drawer is open
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [mobileOpen])

  return (
    <div className="min-h-screen flex flex-col">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="bg-stone-900 sticky top-0 z-40 shadow-[0_1px_0_0_rgba(212,175,55,0.15)]">

        {/* Top bar */}
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-3">

          {/* Brand */}
          <div className="flex items-center gap-3 min-w-0">
            {/* Mobile hamburger */}
            <button
              className="sm:hidden text-stone-400 hover:text-amber-400 transition-colors flex-shrink-0"
              onClick={() => setMobileOpen(true)}
              aria-label="Open navigation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            <div className="flex items-center gap-2 min-w-0">
              {/* Gold diamond accent */}
              <span className="hidden sm:block text-amber-400 text-xs leading-none select-none" aria-hidden="true">◆</span>
              <div className="min-w-0">
                <p className="text-[9px] font-bold tracking-[0.22em] text-amber-400/80 uppercase leading-none">
                  Future Marketing Studio
                </p>
                <h1 className="text-[15px] font-bold text-white tracking-tight leading-snug truncate">
                  Review Intelligence
                </h1>
              </div>
            </div>
          </div>

          {/* Right slot */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <NewReviewsPanel allReviews={allReviews} />
            {dataWindow && (
              <div className="hidden lg:flex items-center gap-1.5 border border-stone-700 rounded-lg px-3 py-1.5">
                <span className="text-[9px] font-bold tracking-widest text-stone-500 uppercase">Data</span>
                <span className="text-stone-300 text-xs font-medium">{dataWindow}</span>
              </div>
            )}
          </div>
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:block max-w-screen-xl mx-auto px-4 sm:px-6" aria-label="Main navigation">
          <ul className="flex overflow-x-auto" role="tablist">
            {TABS.map(t => (
              <li key={t.id} role="presentation">
                <NavLink
                  to={t.path}
                  role="tab"
                  className={({ isActive }) =>
                    `relative flex items-center gap-1.5 px-4 py-3 text-[13px] font-medium whitespace-nowrap ` +
                    `transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400 ` +
                    (isActive
                      ? 'text-amber-400 border-b-2 border-amber-400'
                      : 'text-stone-400 hover:text-stone-100 border-b-2 border-transparent hover:border-stone-600')
                  }
                >
                  {t.label}
                  {t.id === 'actions' && unansweredCount > 0 && (
                    <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[15px] h-[15px] flex items-center justify-center px-1 leading-none">
                      {unansweredCount > 99 ? '99+' : unansweredCount}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* ── Mobile drawer ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-sm sm:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setMobileOpen(false)}
              aria-hidden="true"
            />

            {/* Drawer */}
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 bg-stone-900 border-r border-stone-800 flex flex-col sm:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              aria-label="Navigation drawer"
            >
              {/* Drawer header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-stone-800">
                <div>
                  <p className="text-[9px] font-bold tracking-[0.2em] text-amber-400/80 uppercase">Future Marketing Studio</p>
                  <p className="text-white font-bold text-base leading-snug mt-0.5">Review Intelligence</p>
                </div>
                <button
                  onClick={() => setMobileOpen(false)}
                  className="text-stone-500 hover:text-white transition-colors p-1 -mr-1"
                  aria-label="Close navigation"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Drawer links */}
              <nav className="flex-1 p-3 overflow-y-auto">
                <ul className="space-y-0.5">
                  {TABS.map(t => (
                    <li key={t.id}>
                      <NavLink
                        to={t.path}
                        className={({ isActive }) =>
                          `flex items-center justify-between px-4 py-3 rounded-xl text-sm font-medium transition-all ` +
                          (isActive
                            ? 'bg-amber-400/10 text-amber-400 border border-amber-400/20'
                            : 'text-stone-400 hover:text-white hover:bg-stone-800 border border-transparent')
                        }
                      >
                        <span>{t.label}</span>
                        {t.id === 'actions' && unansweredCount > 0 && (
                          <span className="bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                            {unansweredCount > 99 ? '99+' : unansweredCount}
                          </span>
                        )}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              </nav>

              {/* Drawer footer */}
              {dataWindow && (
                <div className="px-5 py-4 border-t border-stone-800">
                  <p className="text-[9px] font-bold tracking-widest text-stone-500 uppercase mb-1">Data Range</p>
                  <p className="text-stone-400 text-xs">{dataWindow}</p>
                </div>
              )}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8">
        {children}
      </main>

      {/* ── Footer ─────────────────────────────────────────────────────────── */}
      <footer className="border-t border-stone-200 py-4">
        <p className="text-center text-xs text-stone-400 tracking-wide">
          Future Marketing Studio · Review Intelligence Dashboard
        </p>
      </footer>
    </div>
  )
}
