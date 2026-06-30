import { useState } from 'react'
import Rankings from './Rankings.jsx'
import Insights from './Insights.jsx'

const SUBTABS = [
  { id: 'rankings', label: 'Rankings' },
  { id: 'insights',  label: 'Insights' },
]

export default function TrendsAnalytics({ allReviews, filtered, prevFiltered }) {
  const [tab, setTab] = useState('rankings')

  return (
    <div className="space-y-5">
      <div className="border-b border-stone-200">
        <nav className="flex gap-1" role="tablist" aria-label="Trends & Analytics sections">
          {SUBTABS.map(t => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
                tab === t.id
                  ? 'border-amber-500 text-stone-800'
                  : 'border-transparent text-stone-400 hover:text-stone-600 hover:border-stone-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'rankings' && <Rankings allReviews={allReviews} filtered={filtered} prevFiltered={prevFiltered} />}
      {tab === 'insights'  && <Insights allReviews={allReviews} />}
    </div>
  )
}
