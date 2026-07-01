import { useState, useMemo, useCallback } from 'react'
import { useToast } from '../components/ui/Toast.jsx'
import Card from '../components/ui/Card.jsx'
import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { useResponseDrafts } from '../hooks/useIntelligence.js'

const PAGE_SIZE = 40

// ─── Helpers ─────────────────────────────────────────────────────────────────

function exportCSV(rows) {
  const headers = ['Date','Location','City','Stars','Reviewer','Review','Owner Response','Response Status','Review URL']
  const escape  = v => `"${(v ?? '').toString().replace(/"/g, '""')}"`
  const lines   = [
    headers.join(','),
    ...rows.map(r => [
      r.review_date, r.location_name, r.city, r.star_rating, r.reviewer_name,
      r.review_text, r.owner_response,
      r.response_status || (r.owner_response ? 'responded' : 'unanswered'),
      r.review_url,
    ].map(escape).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const a = Object.assign(document.createElement('a'), {
    href: URL.createObjectURL(blob),
    download: `lta-reviews-${new Date().toISOString().slice(0, 10)}.csv`,
  })
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function StarBadge({ n }) {
  const cls = n >= 4 ? 'star-4' : n === 3 ? 'star-3' : 'star-1'
  return <span className={`font-bold text-sm ${cls}`}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

function buildReviewLink(r) {
  if (r.review_url) return { href: r.review_url, label: 'View ↗' }
  const q = [r.location_name, r.reviewer_name && `"${r.reviewer_name}"`].filter(Boolean).join(' ') + ' google review'
  return { href: `https://www.google.com/search?q=${encodeURIComponent(q)}`, label: 'Search ↗' }
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

function FilterBar({ keyword, onKeyword, noReply, onNoReply, stars, onStars, locations, location, onLocation, count }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Keyword */}
      <div className="flex-1 min-w-48 relative">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none"
             style={{ color: 'var(--color-text-3)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
        </svg>
        <input
          type="search"
          placeholder="Search reviews, reviewer, location…"
          value={keyword}
          onChange={e => onKeyword(e.target.value)}
          className="w-full text-sm pl-9 pr-3 py-2 rounded-lg border focus:outline-none focus:ring-2"
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-1)',
            '--tw-ring-color': 'var(--color-accent)',
          }}
          aria-label="Keyword search"
        />
      </div>

      {/* Star filter */}
      <select
        value={stars}
        onChange={e => onStars(e.target.value)}
        className="text-sm px-3 py-2 rounded-lg border focus:outline-none"
        style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)' }}
        aria-label="Filter by stars"
      >
        <option value="">All stars</option>
        {[1,2,3,4,5].map(s => <option key={s} value={s}>{s}★</option>)}
      </select>

      {/* Location */}
      {locations.length > 0 && (
        <select
          value={location}
          onChange={e => onLocation(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg border focus:outline-none max-w-[200px]"
          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-1)' }}
          aria-label="Filter by location"
        >
          <option value="">All locations</option>
          {locations.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
      )}

      {/* No reply toggle */}
      <label className="flex items-center gap-2 text-sm cursor-pointer select-none"
             style={{ color: 'var(--color-text-2)' }}>
        <input type="checkbox" checked={noReply} onChange={e => onNoReply(e.target.checked)}
               className="w-3.5 h-3.5 rounded accent-amber-700" />
        No reply only
      </label>

      <span className="text-xs ml-auto" style={{ color: 'var(--color-text-3)' }}>
        {count.toLocaleString()} results
      </span>
    </div>
  )
}

// ─── Review row ───────────────────────────────────────────────────────────────

function ReviewRow({ r, draft, expanded, onToggle }) {
  const link = buildReviewLink(r)
  const needsReply = !r.owner_response && (r.star_rating ?? 5) <= 2
  const tags = r.complaint_tags ?? []

  return (
    <div
      className={`border-b transition-colors ${needsReply ? 'border-l-4' : ''}`}
      style={{
        borderColor: expanded ? 'var(--color-border-2)' : 'var(--color-border)',
        borderLeftColor: needsReply ? 'var(--color-danger)' : undefined,
        background: expanded ? 'var(--color-surface-2)' : 'var(--color-surface)',
      }}
    >
      {/* Summary row */}
      <div
        className="flex items-start gap-3 px-4 py-3 cursor-pointer hover:bg-stone-50 transition-colors"
        onClick={onToggle}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter') onToggle() }}
        aria-expanded={expanded}
      >
        {/* Star + date */}
        <div className="flex-shrink-0 w-24 pt-0.5">
          <StarBadge n={r.star_rating ?? 1} />
          <p className="text-[10px] mt-1" style={{ color: 'var(--color-text-3)' }}>{r.review_date}</p>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold truncate" style={{ color: 'var(--color-text-1)' }}>
                {r.reviewer_name || 'Anonymous'}
                <span className="font-normal ml-1.5" style={{ color: 'var(--color-text-3)' }}>
                  · {r.location_name}
                </span>
              </p>
              {r.review_text
                ? <p className="text-xs mt-0.5 line-clamp-2 leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
                    {r.review_text}
                  </p>
                : <em className="text-xs" style={{ color: 'var(--color-text-3)' }}>No text</em>
              }
              {tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1.5">
                  {tags.map(t => <span key={t} className="badge badge-danger">{t.replace(/_/g, ' ')}</span>)}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {r.owner_response
                ? <Badge variant="success">✓ Responded</Badge>
                : needsReply
                  ? <Badge variant="danger">Needs reply</Badge>
                  : <Badge variant="neutral">No reply</Badge>
              }
            </div>
          </div>
        </div>

        <svg
          className="w-4 h-4 flex-shrink-0 transition-transform mt-0.5"
          style={{ color: 'var(--color-text-3)', transform: expanded ? 'rotate(180deg)' : '' }}
          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
        </svg>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Full review text */}
          {r.review_text && (
            <div className="p-3 rounded-xl text-sm leading-relaxed"
                 style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-2)' }}>
              "{r.review_text}"
            </div>
          )}

          {/* Owner response */}
          {r.owner_response && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
                 style={{ color: 'var(--color-text-3)' }}>
                Owner Response
              </p>
              <div className="p-3 rounded-xl text-xs leading-relaxed italic"
                   style={{ background: 'var(--color-accent-lt)', border: '1px solid #FDE68A', color: 'var(--color-text-2)' }}>
                {r.owner_response}
              </div>
            </div>
          )}

          {/* AI draft */}
          {draft && !r.owner_response && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider mb-1.5 ai-label">
                ✦ AI Draft Response
              </p>
              <div className="p-3 rounded-xl text-xs leading-relaxed"
                   style={{ background: '#1A1714', color: '#D4C9BC', border: '1px solid #3A2E25' }}>
                {draft.draft}
              </div>
              <p className="text-[10px] mt-1.5" style={{ color: 'var(--color-text-3)' }}>
                Copy this draft, edit as needed, then paste it into Google Business Profile.
              </p>
            </div>
          )}

          {/* Footer actions */}
          <div className="flex items-center gap-2 pt-1">
            <a href={link.href} target="_blank" rel="noopener noreferrer"
               className="badge badge-accent hover:opacity-80 transition-opacity">
              {link.label}
            </a>
            {draft && !r.owner_response && (
              <button
                onClick={() => { navigator.clipboard?.writeText(draft.draft) }}
                className="badge badge-neutral hover:opacity-80 transition-opacity cursor-pointer"
              >
                Copy AI draft
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Sort header ──────────────────────────────────────────────────────────────

function Th({ label, sortKey, active, dir, onSort }) {
  return (
    <th
      className="px-4 py-2.5 text-left"
      style={{ background: 'var(--color-surface-2)', borderBottom: '1px solid var(--color-border)',
               color: 'var(--color-text-2)', fontSize: '0.6875rem', fontWeight: 600, letterSpacing: '0.05em',
               textTransform: 'uppercase', whiteSpace: 'nowrap', cursor: sortKey ? 'pointer' : 'default',
               userSelect: 'none' }}
      onClick={() => sortKey && onSort(sortKey)}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}{active ? (dir === 'asc' ? ' ↑' : ' ↓') : ''}
    </th>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ReviewExplorer({ allReviews = [], filtered = [] }) {
  const showToast = useToast()
  const { data: drafts } = useResponseDrafts()

  const [sortKey, setSortKey]   = useState('review_date')
  const [sortDir, setSortDir]   = useState('desc')
  const [keyword, setKeyword]   = useState('')
  const [noReply, setNoReply]   = useState(false)
  const [stars,   setStars]     = useState('')
  const [locFilter, setLocFilter] = useState('')
  const [page,    setPage]      = useState(0)
  const [expanded, setExpanded] = useState(null)

  const resetPage = useCallback(() => setPage(0), [])

  const locations = useMemo(() => [...new Set(filtered.map(r => r.location_name).filter(Boolean))].sort(), [filtered])

  const processed = useMemo(() => {
    let rows = filtered
    if (noReply)   rows = rows.filter(r => !r.owner_response)
    if (stars)     rows = rows.filter(r => r.star_rating === Number(stars))
    if (locFilter) rows = rows.filter(r => r.location_name === locFilter)
    if (keyword) {
      const kw = keyword.toLowerCase()
      rows = rows.filter(r =>
        (r.review_text   || '').toLowerCase().includes(kw) ||
        (r.reviewer_name || '').toLowerCase().includes(kw) ||
        (r.location_name || '').toLowerCase().includes(kw)
      )
    }
    return [...rows].sort((a, b) => {
      let av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      if (typeof av === 'string') { av = av.toLowerCase(); bv = bv.toLowerCase() }
      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ?  1 : -1
      return 0
    })
  }, [filtered, noReply, stars, locFilter, keyword, sortKey, sortDir])

  const totalPages = Math.max(1, Math.ceil(processed.length / PAGE_SIZE))
  const safePage   = Math.min(page, totalPages - 1)
  const visible    = processed.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE)

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('desc') }
    resetPage()
  }

  // Index drafts by review_id for O(1) lookup
  const draftByReviewId = useMemo(() => {
    if (!drafts) return {}
    const out = {}
    Object.values(drafts).forEach(d => {
      if (d.review_id) out[d.review_id] = d
    })
    return out
  }, [drafts])

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div>
        <h2 className="text-heading" style={{ color: 'var(--color-text-1)' }}>Review Center</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-2)' }}>
          Search, filter, and manage reviews across all locations
        </p>
      </div>

      <Card className="p-4">
        <FilterBar
          keyword={keyword}    onKeyword={v => { setKeyword(v); resetPage() }}
          noReply={noReply}    onNoReply={v => { setNoReply(v); resetPage() }}
          stars={stars}        onStars={v => { setStars(v); resetPage() }}
          locations={locations} location={locFilter} onLocation={v => { setLocFilter(v); resetPage() }}
          count={processed.length}
        />
      </Card>

      {/* Action bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Button variant="secondary" onClick={() => { exportCSV(processed); showToast(`Exported ${processed.length.toLocaleString()} reviews`) }}>
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 20 20" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/>
          </svg>
          Export CSV
        </Button>
        <span className="text-xs" style={{ color: 'var(--color-text-3)' }}>
          {processed.length.toLocaleString()} reviews · sorted by {sortKey.replace('_', ' ')} {sortDir === 'asc' ? '↑' : '↓'}
        </span>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full" style={{ borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <Th label="Date"     sortKey="review_date"   active={sortKey==='review_date'}   dir={sortDir} onSort={toggleSort} />
                <Th label="Content"  sortKey={null}          active={false}                     dir={sortDir} onSort={toggleSort} />
                <Th label="Stars"    sortKey="star_rating"   active={sortKey==='star_rating'}   dir={sortDir} onSort={toggleSort} />
                <Th label="Status"   sortKey={null}          active={false}                     dir={sortDir} onSort={toggleSort} />
                <Th label=""         sortKey={null}          active={false}                     dir={sortDir} onSort={toggleSort} />
              </tr>
            </thead>
          </table>
        </div>

        {/* Review rows (not table rows — allows expand without colspan issues) */}
        <div>
          {visible.length === 0 ? (
            <EmptyState icon="🔍" title="No reviews match your filters"
                        body="Try adjusting your keyword, star filter, or date range." />
          ) : visible.map((r, i) => {
            const rid = r.review_id || r.review_url || ''
            const draft = rid ? draftByReviewId[rid] : null
            const key = `${rid || i}`
            return (
              <ReviewRow
                key={key}
                r={r}
                draft={draft}
                expanded={expanded === key}
                onToggle={() => setExpanded(expanded === key ? null : key)}
              />
            )
          })}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3"
               style={{ borderTop: '1px solid var(--color-border)' }}>
            <Button variant="ghost" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
              ← Previous
            </Button>
            <span className="text-xs" style={{ color: 'var(--color-text-3)' }}>
              Page {safePage + 1} of {totalPages} · {processed.length.toLocaleString()} reviews
            </span>
            <Button variant="ghost" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>
              Next →
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
