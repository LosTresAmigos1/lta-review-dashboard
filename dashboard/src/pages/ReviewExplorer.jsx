import { useState, useMemo } from 'react'
import { getBrand } from '../utils/dataUtils.js'
import { useToast } from '../components/ui/Toast.jsx'
import Card from '../components/ui/Card.jsx'
import Button from '../components/ui/Button.jsx'

const PAGE_SIZE = 50

function exportCSV(rows) {
  const headers = [
    'Date','Location','City','Stars','Reviewer',
    'Review','Owner Response','Response Status',
    'Review URL','Review ID','Last Checked At',
  ]
  const escape  = v => `"${(v ?? '').toString().replace(/"/g, '""')}"`
  const lines   = [
    headers.join(','),
    ...rows.map(r => [
      r.review_date, r.location_name, r.city, r.star_rating,
      r.reviewer_name, r.review_text, r.owner_response,
      r.response_status || (r.owner_response ? 'responded' : 'unanswered'),
      r.review_url, r.review_id || '', r.last_checked_at || '',
    ].map(escape).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `lta-reviews-${new Date().toISOString().slice(0, 10)}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

// Google does not expose stable individual review deep links. The best we can
// do is link to the business's review page (review_url) or fall back to a
// Google Search that can surface the review in search results.
function buildReviewLink(r) {
  if (r.review_url) {
    return {
      href: r.review_url,
      label: 'View ↗',
      title: 'Opens the business reviews page on Google (Google does not provide individual review links)',
    }
  }
  const q = [r.location_name, r.reviewer_name && `"${r.reviewer_name}"`]
    .filter(Boolean).join(' ') + ' google review'
  return {
    href: `https://www.google.com/search?q=${encodeURIComponent(q)}`,
    label: 'Search ↗',
    title: 'No direct URL stored — searches Google to find this review',
  }
}

function StarBadge({ n }) {
  const color = n >= 4 ? 'text-emerald-600' : n === 3 ? 'text-yellow-600' : 'text-red-500'
  return <span className={`font-medium ${color}`}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

export default function ReviewExplorer({ filtered }) {
  const showToast = useToast()
  const [sortKey,  setSortKey]  = useState('review_date')
  const [sortDir,  setSortDir]  = useState('desc')
  const [keyword,  setKeyword]  = useState('')
  const [noReply,  setNoReply]  = useState(false)
  const [page,     setPage]     = useState(0)
  const [expanded, setExpanded] = useState(null)

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    setPage(0)
  }

  const processed = useMemo(() => {
    let rows = filtered
    if (noReply)  rows = rows.filter(r => !r.owner_response)
    if (keyword) {
      const kw = keyword.toLowerCase()
      rows = rows.filter(r =>
        r.review_text.toLowerCase().includes(kw) ||
        r.reviewer_name.toLowerCase().includes(kw) ||
        r.location_name.toLowerCase().includes(kw)
      )
    }
    rows = [...rows].sort((a, b) => {
      let av = a[sortKey], bv = b[sortKey]
      if (typeof av === 'string') av = av.toLowerCase(), bv = bv.toLowerCase()
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })
    return rows
  }, [filtered, noReply, keyword, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages - 1)
  const visible    = processed.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  function Th({ k, label }) {
    const active = sortKey === k
    return (
      <th
        scope="col"
        className="px-3 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide cursor-pointer select-none hover:text-stone-700 whitespace-nowrap"
        onClick={() => toggleSort(k)}
        aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
      >
        {label}{active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <Card className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-48">
          <label className="sr-only" htmlFor="kw-search">Keyword search</label>
          <input
            id="kw-search"
            type="search"
            placeholder="Search review text, reviewer, location…"
            value={keyword}
            onChange={e => { setKeyword(e.target.value); setPage(0) }}
            className="w-full text-sm border border-stone-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-amber-400"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-stone-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={noReply}
            onChange={e => { setNoReply(e.target.checked); setPage(0) }}
            className="accent-amber-600 w-4 h-4"
          />
          No owner response only
        </label>
        <span className="text-xs text-stone-400">{processed.length.toLocaleString()} results</span>
        <Button
          variant="secondary"
          onClick={() => { exportCSV(processed); showToast(`Exported ${processed.length.toLocaleString()} reviews`) }}
          className="ml-auto"
          title={`Export ${processed.length.toLocaleString()} reviews as CSV`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5">
            <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
            <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
          </svg>
          Export CSV
        </Button>
      </Card>

      {/* Table */}
      <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm" aria-label="Reviews table">
            <thead className="bg-stone-50 border-b border-stone-200">
              <tr>
                <Th k="review_date"    label="Date"     />
                <Th k="location_name"  label="Location" />
                <Th k="star_rating"    label="Stars"    />
                <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Review</th>
                <th scope="col" className="px-3 py-3 text-left text-xs font-semibold text-stone-500 uppercase tracking-wide">Response</th>
                <th scope="col" className="px-3 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {visible.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-stone-400 text-sm">
                    No reviews match your filters.
                  </td>
                </tr>
              )}
              {visible.map((r, i) => {
                const key = `${r.review_url || i}`
                const isExpanded = expanded === key
                const needsReply = !r.owner_response && Number(r.star_rating) <= 2
                return (
                  <tr
                    key={key}
                    className={`hover:bg-stone-50 transition-colors ${needsReply ? 'border-l-2 border-l-orange-300' : ''}`}
                  >
                    <td className="px-3 py-3 text-xs text-stone-500 whitespace-nowrap">{r.review_date}</td>
                    <td className="px-3 py-3">
                      <p className="text-xs font-medium text-stone-700 max-w-[140px] truncate" title={r.location_name}>{r.location_name}</p>
                      <p className="text-[10px] text-stone-400">{r.city}</p>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap"><StarBadge n={r.star_rating} /></td>
                    <td className="px-3 py-3 max-w-xs">
                      {r.review_text
                        ? <p className={`text-xs text-stone-600 leading-relaxed ${isExpanded ? '' : 'line-clamp-2'}`}>{r.review_text}</p>
                        : <em className="text-xs text-stone-300">No text</em>
                      }
                      {r.review_text?.length > 120 && (
                        <button
                          onClick={() => setExpanded(isExpanded ? null : key)}
                          className="text-[10px] text-amber-600 hover:text-amber-800 mt-0.5"
                        >
                          {isExpanded ? 'less' : 'more'}
                        </button>
                      )}
                      {r.reviewer_name && <p className="text-[10px] text-stone-400 mt-0.5">— {r.reviewer_name}</p>}
                    </td>
                    <td className="px-3 py-3 max-w-[160px]">
                      {r.owner_response
                        ? (
                          <div>
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full mb-1">
                              ✓ Responded
                            </span>
                            <p className="text-xs text-stone-500 line-clamp-2 italic">{r.owner_response}</p>
                          </div>
                        )
                        : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-500 bg-orange-50 px-2 py-0.5 rounded-full" title="No owner response has been recorded for this review">
                            <span aria-hidden="true">!</span> No reply
                          </span>
                        )
                      }
                    </td>
                    <td className="px-3 py-3">
                      {(() => {
                        const link = buildReviewLink(r)
                        return (
                          <a
                            href={link.href}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] text-amber-600 hover:text-amber-800 underline whitespace-nowrap"
                            title={link.title}
                            aria-label={`${link.label} — ${r.reviewer_name}`}
                          >
                            {link.label}
                          </a>
                        )
                      })()}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-stone-100 px-4 py-3">
            <button
              disabled={safePage === 0}
              onClick={() => setPage(safePage - 1)}
              className="text-sm text-stone-600 hover:text-stone-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >← Previous</button>
            <span className="text-xs text-stone-400">
              Page {safePage + 1} of {totalPages} · {processed.length.toLocaleString()} reviews
            </span>
            <button
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage(safePage + 1)}
              className="text-sm text-stone-600 hover:text-stone-800 disabled:opacity-30 disabled:cursor-not-allowed"
            >Next →</button>
          </div>
        )}
      </div>
    </div>
  )
}
