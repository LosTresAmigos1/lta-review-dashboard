import NewReviewsPanel from './NewReviewsPanel.jsx'

const TABS = [
  { id: 'overview',   label: 'Overview'         },
  { id: 'locations',  label: 'Locations'        },
  { id: 'explorer',   label: 'Review Explorer'  },
  { id: 'rankings',   label: 'Rankings'         },
  { id: 'actions',    label: 'Action Items'     },
  { id: 'insights',   label: 'Insights'         },
]

export default function Layout({ page, onPage, dataWindow, allReviews, unansweredCount, children }) {
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
                <button
                  role="tab"
                  aria-selected={page === t.id}
                  onClick={() => onPage(t.id)}
                  className={`relative px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                    page === t.id
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
                </button>
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
