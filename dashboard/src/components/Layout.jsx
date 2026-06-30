import { NavLink } from 'react-router-dom'
import NewReviewsPanel from './NewReviewsPanel.jsx'

const TABS = [
  { id: 'overview',  path: '/overview',  label: 'Overview'           },
  { id: 'locations', path: '/locations', label: 'Locations'          },
  { id: 'explorer',  path: '/explorer',  label: 'All Reviews'        },
  { id: 'actions',   path: '/actions',   label: 'Needs Attention'    },
  { id: 'trends',    path: '/trends',    label: 'Trends & Analytics' },
  { id: 'scraper',   path: '/scraper-status', label: 'Scraper Status' },
  { id: 'reports',   path: '/reports',   label: 'Reports'            },
]

export default function Layout({ dataWindow, allReviews, unansweredCount, children }) {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-stone-900 text-white">
        <div className="max-w-screen-xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-xs font-semibold tracking-widest text-amber-400 uppercase">Future Marketing Studio</p>
            <h1 className="text-xl font-bold tracking-tight">Review Intelligence</h1>
          </div>
          <div className="flex items-center gap-4">
            <NewReviewsPanel allReviews={allReviews} />
            {dataWindow && (
              <p className="text-xs text-stone-400">
                Data window: <span className="text-stone-200">{dataWindow}</span>
              </p>
            )}
          </div>
        </div>

        {/* Nav */}
        <nav className="max-w-screen-xl mx-auto px-4 sm:px-6" aria-label="Main navigation">
          <ul className="flex gap-1 overflow-x-auto" role="tablist">
            {TABS.map(t => (
              <li key={t.id} role="presentation">
                <NavLink
                  to={t.path}
                  role="tab"
                  className={({ isActive }) => `relative block px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                    isActive
                      ? 'border-amber-400 text-white'
                      : 'border-transparent text-stone-400 hover:text-stone-200 hover:border-stone-500'
                  }`}
                >
                  {t.label}
                  {t.id === 'actions' && unansweredCount > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[9px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
                      {unansweredCount > 99 ? '99+' : unansweredCount}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-screen-xl mx-auto w-full px-4 sm:px-6 py-6">
        {children}
      </main>

      <footer className="border-t border-stone-200 py-4">
        <p className="text-center text-xs text-stone-400">
          Future Marketing Studio · Review Intelligence Dashboard
        </p>
      </footer>
    </div>
  )
}
