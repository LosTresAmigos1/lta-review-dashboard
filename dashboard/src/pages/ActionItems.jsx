import { useMemo, useState } from 'react'
import Card from '../components/ui/Card.jsx'
import Badge from '../components/ui/Badge.jsx'
import Button from '../components/ui/Button.jsx'
import Skeleton from '../components/ui/Skeleton.jsx'
import EmptyState from '../components/ui/EmptyState.jsx'
import { useResponseDrafts, useActionItems } from '../hooks/useIntelligence.js'

// ─── Priority score (lower star + older = higher priority) ───────────────────
function priority(r) {
  const stars   = Number(r.star_rating) || 3
  const daysOld = (Date.now() - new Date((r.review_date || '2020-01-01') + 'T12:00:00').getTime()) / 86400000
  return (6 - stars) * 10 + Math.min(daysOld, 60)
}

function StarBadge({ n }) {
  const cls = n <= 1 ? 'badge-danger' : n === 2 ? 'badge-warning' : 'badge-neutral'
  return <span className={`badge ${cls} font-bold`}>{'★'.repeat(n)}{'☆'.repeat(5 - n)}</span>
}

// ─── Individual review card ───────────────────────────────────────────────────

function ReviewCard({ r, draft, hasDraft }) {
  const [copied, setCopied] = useState(false)
  const [showDraft, setShowDraft] = useState(false)
  const daysOld = Math.floor((Date.now() - new Date((r.review_date || '') + 'T12:00:00').getTime()) / 86400000)

  function copyDraft() {
    if (!draft?.draft) return
    navigator.clipboard?.writeText(draft.draft)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="card p-4 space-y-3"
         style={{ borderLeft: `3px solid ${(r.star_rating ?? 3) <= 1 ? 'var(--color-danger)' : '#d97706'}` }}>

      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold" style={{ color: 'var(--color-text-1)' }}>
              {r.reviewer_name || 'Anonymous'}
            </p>
            <StarBadge n={r.star_rating ?? 1} />
            {hasDraft && <Badge variant="accent">✦ AI Draft Ready</Badge>}
          </div>
          <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-3)' }}>
            {r.location_name} · {r.review_date}
            {daysOld > 0 && <span className={daysOld > 14 ? ' text-red-500' : ''}> · {daysOld}d ago</span>}
          </p>
        </div>
      </div>

      {/* Review text */}
      {r.review_text && (
        <p className="text-sm leading-relaxed" style={{ color: 'var(--color-text-2)' }}>
          "{r.review_text}"
        </p>
      )}

      {/* AI draft */}
      {hasDraft && (
        <div>
          <button
            onClick={() => setShowDraft(s => !s)}
            className="text-xs font-semibold mb-2 flex items-center gap-1.5"
            style={{ color: 'var(--color-accent)' }}
          >
            <span className="ai-label">✦ AI Draft</span>
            <svg className="w-3 h-3 transition-transform" style={{ transform: showDraft ? 'rotate(180deg)' : '' }}
                 fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
            </svg>
          </button>
          {showDraft && (
            <div className="p-3 rounded-xl text-xs leading-relaxed"
                 style={{ background: '#1A1714', color: '#D4C9BC', border: '1px solid #3A2E25' }}>
              {draft.draft}
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1">
        {r.review_url && (
          <a href={r.review_url} target="_blank" rel="noopener noreferrer">
            <Button variant="secondary">Respond on Google ↗</Button>
          </a>
        )}
        {hasDraft && showDraft && (
          <Button variant={copied ? 'accent' : 'ghost'} onClick={copyDraft}>
            {copied ? '✓ Copied' : 'Copy Draft'}
          </Button>
        )}
      </div>
    </div>
  )
}

// ─── Trend alerts section ─────────────────────────────────────────────────────

function TrendAlerts({ items }) {
  const trends = items?.trendAlerts ?? []
  if (!trends.length) return null

  return (
    <div className="space-y-3">
      <h3 className="text-label" style={{ color: 'var(--color-text-2)' }}>
        Rating Trend Alerts
      </h3>
      {trends.map((t, i) => {
        const improving = t.delta > 0
        return (
          <div key={i} className="flex items-start gap-3 p-4 rounded-xl border"
               style={{
                 background: improving ? 'var(--color-success-bg)' : 'var(--color-warning-bg)',
                 borderColor: improving ? '#BBF7D0' : '#FDE68A',
               }}>
            <span className="text-xl flex-shrink-0">{improving ? '↑' : '↓'}</span>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: 'var(--color-text-1)' }}>
                {t.name}
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-2)' }}>
                {improving
                  ? `Rating improved: ${t.avgPrev}★ → ${t.avgCur}★ (+${t.delta.toFixed(2)})`
                  : `Rating declined: ${t.avgPrev}★ → ${t.avgCur}★ (${t.delta.toFixed(2)})`
                }
                <span style={{ color: 'var(--color-text-3)' }}>
                  {' '}· {t.curN} reviews this period vs {t.prevN} prior
                </span>
              </p>
            </div>
            <Badge variant={improving ? 'success' : 'warning'} className="flex-shrink-0">
              {improving ? `+${t.delta.toFixed(2)}` : t.delta.toFixed(2)}★
            </Badge>
          </div>
        )
      })}
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ActionItems({ allReviews }) {
  const { data: items,  isLoading: lItems  } = useActionItems()
  const { data: drafts, isLoading: lDrafts } = useResponseDrafts()
  const [filter, setFilter] = useState('all') // 'all' | 'draft' | 'urgent'

  const draftByReviewId = useMemo(() => {
    if (!drafts) return {}
    const out = {}
    Object.values(drafts).forEach(d => { if (d.review_id) out[d.review_id] = d })
    return out
  }, [drafts])

  const unanswered = useMemo(() => {
    const reviews = items?.unanswered ?? []
    const sorted  = [...reviews].sort((a, b) => priority(b) - priority(a))

    if (filter === 'urgent') return sorted.filter(r => (r.star_rating ?? 5) <= 1)
    if (filter === 'draft')  return sorted.filter(r => draftByReviewId[r.review_id || r.review_url])
    return sorted
  }, [items, filter, draftByReviewId])

  const total      = items?.unanswered?.length ?? 0
  const draftCount = useMemo(() =>
    (items?.unanswered ?? []).filter(r => draftByReviewId[r.review_id || r.review_url]).length,
    [items, draftByReviewId]
  )
  const urgentCount = (items?.unanswered ?? []).filter(r => (r.star_rating ?? 5) <= 1).length

  const isLoading = lItems || lDrafts

  return (
    <div className="space-y-6 max-w-[900px]">

      <div>
        <h2 className="text-heading" style={{ color: 'var(--color-text-1)' }}>Response Center</h2>
        <p className="text-sm mt-0.5" style={{ color: 'var(--color-text-2)' }}>
          Prioritized queue of reviews awaiting owner responses
        </p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Needs Response', value: total,       badge: 'danger'  },
          { label: 'AI Draft Ready',  value: draftCount,  badge: 'accent'  },
          { label: '1★ (Urgent)',     value: urgentCount, badge: 'warning' },
        ].map(s => (
          <Card key={s.label} className="p-4 text-center">
            <p className="text-3xl font-black" style={{ color: 'var(--color-text-1)', fontWeight: 800 }}>
              {isLoading ? '—' : s.value}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider mt-1"
               style={{ color: 'var(--color-text-3)' }}>
              {s.label}
            </p>
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--color-surface-2)' }}>
        {[
          { id: 'all',    label: `All (${total})` },
          { id: 'draft',  label: `AI Draft Ready (${draftCount})` },
          { id: 'urgent', label: `1★ Urgent (${urgentCount})` },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className="px-4 py-2 text-sm font-medium rounded-lg transition-all"
            style={filter === t.id
              ? { background: 'var(--color-surface)', color: 'var(--color-text-1)', boxShadow: 'var(--shadow-sm)' }
              : { color: 'var(--color-text-2)' }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Review cards */}
      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-32 w-full" />)}
        </div>
      ) : unanswered.length === 0 ? (
        <EmptyState
          icon={total === 0 ? '✓' : '🔍'}
          title={total === 0 ? 'All caught up!' : 'No reviews match this filter'}
          body={total === 0
            ? 'No unanswered negative reviews. Great work!'
            : 'Try switching to "All" to see everything.'}
        />
      ) : (
        <div className="space-y-3">
          {unanswered.map((r, i) => {
            const rid   = r.review_id || r.review_url || ''
            const draft = rid ? draftByReviewId[rid] : null
            return (
              <ReviewCard key={`${rid || i}`} r={r} draft={draft} hasDraft={!!draft} />
            )
          })}
        </div>
      )}

      {/* Trend alerts */}
      {!isLoading && <TrendAlerts items={items} />}
    </div>
  )
}

// ─── Exported hook (used by App.jsx for sidebar badge) ───────────────────────

export function useUnansweredCount(allReviews) {
  return useMemo(() => {
    const d90 = new Date(Date.now() - 90 * 86400000).toISOString().slice(0, 10)
    return allReviews.filter(r =>
      Number(r.star_rating) <= 2 &&
      !r.owner_response?.trim() &&
      (r.review_date || '') >= d90
    ).length
  }, [allReviews])
}
