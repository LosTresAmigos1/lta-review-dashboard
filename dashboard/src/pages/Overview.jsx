import { useMemo, useState } from 'react'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  LineChart, Line, Legend, ComposedChart, Cell,
} from 'recharts'
import {
  getSentiment, getMonthlyTrend, fmtPct, fmtRating, getBrandColor, getBrand,
  getConfidence, isUnverified,
} from '../utils/dataUtils.js'

function KPICard({ label, value, sub, accent }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5 flex flex-col gap-1">
      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{label}</p>
      <p className={`text-3xl font-bold tracking-tight ${accent || 'text-stone-800'}`}>{value}</p>
      {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
    </div>
  )
}

const RATING_COLORS = { 5:'#10b981', 4:'#6ee7b7', 3:'#fbbf24', 2:'#f97316', 1:'#ef4444' }
const DEFAULT_GOAL  = 4.5

function GoalTracker({ allReviews }) {
  const [goals, setGoals] = useState(() => {
    try { return JSON.parse(localStorage.getItem('lta_goals') || '{}') } catch { return {} }
  })
  const [editing, setEditing] = useState(null) // loc name being edited
  const [editVal, setEditVal] = useState('')

  const locStats = useMemo(() => {
    const locs = [...new Set(allReviews.map(r => r.location_name))].sort()
    return locs.map(loc => {
      const revs = allReviews.filter(r => r.location_name === loc)
      const avg  = revs.length ? revs.reduce((s,r) => s + Number(r.star_rating), 0) / revs.length : 0
      const goal = goals[loc] ?? DEFAULT_GOAL
      return { loc, avg, goal, pct: Math.min(avg / goal * 100, 100), count: revs.length }
    })
  }, [allReviews, goals])

  function saveGoal(loc, raw) {
    const parsed = parseFloat(raw)
    const val = Math.min(5, Math.max(1, Number.isNaN(parsed) ? DEFAULT_GOAL : parsed))
    const next = { ...goals, [loc]: +val.toFixed(1) }
    setGoals(next)
    localStorage.setItem('lta_goals', JSON.stringify(next))
    setEditing(null)
  }

  const atGoal = locStats.filter(d => d.avg >= d.goal).length

  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-stone-700">Rating Goals</h2>
        <span className="text-xs text-stone-400">{atGoal}/{locStats.length} locations at goal · click target to edit</span>
      </div>
      <p className="text-xs text-stone-400 mb-4">Lifetime average vs. your target. Default goal is {DEFAULT_GOAL} ★</p>
      <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
        {locStats.map(({ loc, avg, goal, pct, count }) => {
          const color   = pct >= 100 ? '#10b981' : pct >= 90 ? '#fbbf24' : '#ef4444'
          const textCol = pct >= 100 ? 'text-emerald-600' : pct >= 90 ? 'text-yellow-600' : 'text-red-500'
          const short   = loc.replace('Los Tres Amigos ','LTA ').replace('Los Tres Mex Grill ','LTMG ')
          return (
            <div key={loc}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-xs text-stone-600 flex-1 truncate" title={loc}>{short}</span>
                <span className={`text-xs font-bold tabular-nums ${textCol}`}>{avg.toFixed(2)} ★</span>
                <span className="text-stone-300 text-xs">/</span>
                {editing === loc ? (
                  <form onSubmit={e => { e.preventDefault(); saveGoal(loc, editVal) }} className="flex gap-1">
                    <input
                      autoFocus
                      type="number" min="1" max="5" step="0.1"
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      onBlur={() => saveGoal(loc, editVal)}
                      className="w-14 text-xs border border-amber-400 rounded px-1 py-0.5 focus:outline-none"
                    />
                  </form>
                ) : (
                  <button
                    onClick={() => { setEditing(loc); setEditVal(String(goal)) }}
                    className="text-xs text-stone-400 hover:text-amber-600 tabular-nums underline underline-offset-2 decoration-dashed"
                    title="Click to set goal"
                  >{goal.toFixed(1)} ★</button>
                )}
                <span className="text-[10px] text-stone-300 w-16 text-right tabular-nums">{count} reviews</span>
              </div>
              <div className="w-full bg-stone-100 rounded-full h-2 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function Overview({ allReviews, filtered }) {
  const sentiment     = useMemo(() => getSentiment(filtered), [filtered])
  const allSentiment  = useMemo(() => getSentiment(allReviews), [allReviews])
  const monthlyTrend  = useMemo(() => getMonthlyTrend(filtered), [filtered])

  // Star distribution for period
  const starDist = useMemo(() => [5,4,3,2,1].map(s => ({
    star: `${s}★`,
    count: filtered.filter(r => r.star_rating === s).length,
  })), [filtered])

  // Positive % by location
  const byLocation = useMemo(() => {
    const locs = [...new Set(filtered.map(r => r.location_name))]
    return locs.map(name => {
      const revs = filtered.filter(r => r.location_name === name)
      const pos  = revs.filter(r => r.star_rating >= 4).length
      const pct  = revs.length > 0 ? +(pos / revs.length * 100).toFixed(1) : 0
      const n    = revs.length
      const conf = getConfidence(n)
      const low  = conf.level < 3
      return { name: name.replace('Los Tres Amigos ', '').replace('Los Tres Mex Grill ', 'LTM '), fullName: name, pct, n, low }
    }).sort((a, b) => b.pct - a.pct)
  }, [filtered])

  const lifetimeRating = useMemo(() => {
    if (!allReviews.length) return null
    return +(allReviews.reduce((s, r) => s + r.star_rating, 0) / allReviews.length).toFixed(2)
  }, [allReviews])

  const CustomBarLabel = ({ x, y, width, value, payload }) => {
    if (!payload?.n) return null
    return (
      <text x={x + width + 4} y={y + 10} fill="#78716c" fontSize={10}>
        n={payload.n}
      </text>
    )
  }

  const CustomTooltipBar = ({ active, payload }) => {
    if (!active || !payload?.length) return null
    const d = payload[0]?.payload
    if (!d) return null
    return (
      <div className="bg-white border border-stone-200 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold text-stone-700 mb-1">{d.fullName || d.name}</p>
        <p className="text-stone-600">Positive: <strong>{d.pct}%</strong></p>
        <p className="text-stone-400">n = {d.n}</p>
        {d.low && <p className="text-orange-500 mt-1">⚠ Low sample</p>}
      </div>
    )
  }

  const CustomTooltipTrend = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div className="bg-white border border-stone-200 rounded-lg shadow-lg p-3 text-xs">
        <p className="font-semibold text-stone-600 mb-1">{label}</p>
        {payload.map(p => (
          <p key={p.dataKey} style={{ color: p.color }}>
            {p.name}: <strong>{p.value ?? '—'}</strong>
          </p>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard
          label="Lifetime Rating"
          value={lifetimeRating != null ? `${lifetimeRating} ★` : '—'}
          sub={`${allReviews.length.toLocaleString()} total reviews`}
          accent="text-amber-600"
        />
        <KPICard
          label="Period Reviews"
          value={filtered.length.toLocaleString()}
          sub={`${fmtPct(allSentiment.positive)} lifetime positive`}
        />
        <KPICard
          label="Positive"
          value={fmtPct(sentiment.positive)}
          sub={`${sentiment.positiveN} reviews (4-5 ★)`}
          accent="text-emerald-600"
        />
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide mb-2">Sentiment Split</p>
          <div className="space-y-1.5">
            {[
              { label: 'Positive', pct: sentiment.positive, n: sentiment.positiveN, color: 'bg-emerald-400' },
              { label: 'Neutral',  pct: sentiment.neutral,  n: sentiment.neutralN,  color: 'bg-yellow-400'  },
              { label: 'Bad',      pct: sentiment.bad,       n: sentiment.badN,      color: 'bg-red-400'     },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2 text-xs">
                <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.color}`} aria-hidden="true" />
                <span className="w-14 text-stone-600">{s.label}</span>
                <div className="flex-1 bg-stone-100 rounded-full h-1.5 overflow-hidden">
                  <div className={`h-full ${s.color} rounded-full`} style={{ width: `${s.pct}%` }} />
                </div>
                <span className="w-10 text-right font-medium">{fmtPct(s.pct)}</span>
                <span className="text-stone-400">({s.n})</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Star distribution */}
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-4">Star Distribution — Period</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={starDist} layout="vertical" margin={{ top: 0, right: 40, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e5e4" />
              <XAxis type="number" tick={{ fontSize: 11 }} />
              <YAxis type="category" dataKey="star" tick={{ fontSize: 12 }} width={30} />
              <Tooltip cursor={{ fill: '#f5f5f4' }} />
              <Bar dataKey="count" name="Reviews" radius={[0, 4, 4, 0]}>
                {starDist.map(d => (
                  <Cell key={d.star} fill={RATING_COLORS[parseInt(d.star)]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Positive % by location */}
        <div className="bg-white rounded-xl border border-stone-200 p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-1">Positive % by Location</h2>
          <p className="text-xs text-stone-400 mb-4">Striped bars = n&lt;10 (low confidence)</p>
          {byLocation.length === 0
            ? <p className="text-sm text-stone-400 py-8 text-center">No data for selected filters</p>
            : (
              <ResponsiveContainer width="100%" height={Math.max(200, byLocation.length * 36)}>
                <BarChart data={byLocation} layout="vertical" margin={{ top: 0, right: 50, left: 10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e7e5e4" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={v => `${v}%`} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                  <Tooltip content={<CustomTooltipBar />} />
                  <Bar dataKey="pct" name="Positive %" radius={[0, 4, 4, 0]} label={<CustomBarLabel />}>
                    {byLocation.map(d => (
                      <Cell
                        key={d.fullName}
                        fill={d.low ? '#d6d3d1' : '#d97706'}
                        fillOpacity={d.low ? 0.5 : 1}
                        className={d.low ? 'low-confidence' : ''}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )
          }
        </div>
      </div>

      {/* Goal tracker */}
      <GoalTracker allReviews={allReviews} />

      {/* Monthly trend */}
      <div className="bg-white rounded-xl border border-stone-200 p-5">
        <h2 className="text-sm font-semibold text-stone-700 mb-4">Monthly Trend — Avg Rating &amp; Volume</h2>
        {monthlyTrend.length < 2
          ? <p className="text-sm text-stone-400 py-8 text-center">Not enough data for a trend</p>
          : (
            <ResponsiveContainer width="100%" height={260}>
              <ComposedChart data={monthlyTrend} margin={{ top: 4, right: 24, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" />
                <XAxis dataKey="ym" tick={{ fontSize: 10 }} />
                <YAxis yAxisId="vol" orientation="right" tick={{ fontSize: 10 }} label={{ value: 'Reviews', angle: 90, position: 'insideRight', fontSize: 10, fill: '#a8a29e' }} />
                <YAxis yAxisId="rat" domain={[1, 5]} tick={{ fontSize: 10 }} label={{ value: 'Avg ★', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#a8a29e' }} />
                <Tooltip content={<CustomTooltipTrend />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar yAxisId="vol" dataKey="count" name="# Reviews" fill="#e7e5e4" radius={[2, 2, 0, 0]} />
                <Line yAxisId="rat" type="monotone" dataKey="avg" name="Avg Rating" stroke="#d97706" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          )
        }
      </div>
    </div>
  )
}
