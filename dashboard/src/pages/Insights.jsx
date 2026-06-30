import { useMemo, useState } from 'react'
import { extractInsights } from '../utils/textAnalysis.js'
import { getBrand, getBrandColor } from '../utils/dataUtils.js'

// ── Language detection ─────────────────────────────────────────────────────────
const SPANISH_CHARS  = /[áéíóúñ¡¿üÁÉÍÓÚÑÜ]/g
const SPANISH_WORDS  = /\b(muy|bueno|excelente|rico|comida|gracias|todo|bien|lugar|siempre|familia|precios|delicioso|ambiente|sabor|recomiendo|había|están|también|para|pero|como|este|esta|que|con|una|por|más|fue|era|son|han|está|aquí|mucho|servicio|todo|nos|al|del|les|sin|solo|todas)\b/gi

function detectLang(text) {
  if (!text || text.length < 8) return 'English'
  let score = (text.match(SPANISH_CHARS) || []).length * 1.5
  score    += (text.match(SPANISH_WORDS) || []).length
  return score >= 3 ? 'Spanish' : 'English'
}

const DAY_NAMES = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat']
const MON_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Staff Mentions ─────────────────────────────────────────────────────────────
function StaffMentions({ allReviews }) {
  const [locFilter, setLocFilter] = useState('All')

  const locs = useMemo(() =>
    ['All', ...new Set(allReviews.map(r => r.location_name))].sort(), [allReviews])

  const base = locFilter === 'All' ? allReviews : allReviews.filter(r => r.location_name === locFilter)
  const { staffNames } = useMemo(() => extractInsights(base), [base])

  return (
    <section>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1 h-6 bg-blue-500 rounded-full" />
        <h2 className="text-lg font-bold text-stone-800">Staff / Manager Mentions</h2>
        <span className="text-xs text-stone-400">Named in customer reviews</span>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        Employees mentioned by name — useful for recognizing standout performers and identifying issues.
      </p>

      <div className="flex flex-wrap gap-2 mb-5">
        {locs.slice(0, 10).map(l => (
          <button key={l} onClick={() => setLocFilter(l)}
            className={`text-xs px-3 py-1 rounded-full border transition-colors ${
              locFilter === l ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-stone-600 border-stone-200 hover:border-blue-400'
            }`}>
            {l === 'All' ? 'All Locations' : l.replace('Los Tres Amigos ','LTA ').replace('Los Tres Mex Grill ','LTMG ')}
          </button>
        ))}
      </div>

      {staffNames.length === 0 ? (
        <div className="bg-stone-50 border border-stone-200 rounded-xl p-8 text-center text-stone-400">
          No staff names detected in reviews for this location.
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {staffNames.map(({ name, count, reviews: ex }, i) => {
            const avgStars = ex.length ? (ex.reduce((s,r) => s + Number(r.star_rating), 0) / ex.length).toFixed(1) : '—'
            const starColor = Number(avgStars) >= 4 ? 'text-emerald-600' : Number(avgStars) >= 3 ? 'text-yellow-600' : 'text-red-500'
            return (
              <div key={i} className="bg-white border border-stone-200 rounded-xl p-4 shadow-sm">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <p className="font-bold text-stone-800">{name}</p>
                    <p className="text-xs text-stone-400">{count} mention{count !== 1 ? 's' : ''}</p>
                  </div>
                  <span className={`font-bold text-lg ${starColor}`}>{avgStars} ★</span>
                </div>
                {ex[0]?.review_text && (
                  <p className="text-xs text-stone-500 italic border-t border-stone-100 pt-2 mt-2 line-clamp-3">
                    "{ex[0].review_text.slice(0, 140)}{ex[0].review_text.length > 140 ? '…' : ''}"
                    <span className="not-italic text-stone-400 block mt-0.5">— {ex[0].location_name}</span>
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

// ── Peak Review Times ──────────────────────────────────────────────────────────
function PeakTimes({ allReviews }) {
  const byDay = useMemo(() => {
    const map = Array.from({ length: 7 }, (_, i) => ({ day: DAY_NAMES[i], count: 0, sum: 0 }))
    allReviews.forEach(r => {
      if (!r.review_date) return
      const dow = new Date(r.review_date + 'T12:00:00').getDay()
      map[dow].count++
      map[dow].sum += Number(r.star_rating)
    })
    return map.map(d => ({ ...d, avg: d.count ? +(d.sum / d.count).toFixed(2) : null }))
  }, [allReviews])

  const byMonth = useMemo(() => {
    const map = Array.from({ length: 12 }, (_, i) => ({ month: MON_NAMES[i], count: 0, sum: 0 }))
    allReviews.forEach(r => {
      if (!r.review_date) return
      const m = parseInt(r.review_date.slice(5, 7), 10) - 1
      map[m].count++
      map[m].sum += Number(r.star_rating)
    })
    return map.map(d => ({ ...d, avg: d.count ? +(d.sum / d.count).toFixed(2) : null }))
  }, [allReviews])

  const maxDay = Math.max(...byDay.map(d => d.count))
  const maxMon = Math.max(...byMonth.map(d => d.count))

  return (
    <section>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1 h-6 bg-amber-500 rounded-full" />
        <h2 className="text-lg font-bold text-stone-800">Peak Review Times</h2>
      </div>
      <p className="text-sm text-stone-500 mb-6">
        When customers leave reviews — useful for scheduling follow-ups and understanding visit patterns.
      </p>

      <div className="grid sm:grid-cols-2 gap-6">
        {/* By day of week */}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">By Day of Week</h3>
          <div className="space-y-2">
            {byDay.map(({ day, count, avg }) => (
              <div key={day} className="flex items-center gap-3">
                <span className="text-xs text-stone-500 w-8 shrink-0">{day}</span>
                <div className="flex-1 bg-stone-100 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all flex items-center justify-end pr-1"
                    style={{ width: maxDay ? `${(count / maxDay) * 100}%` : '0%' }}
                  >
                    {count > 0 && <span className="text-[9px] font-bold text-amber-900">{count}</span>}
                  </div>
                </div>
                {avg && <span className="text-xs text-stone-400 w-12 shrink-0 text-right">{avg} ★</span>}
              </div>
            ))}
          </div>
        </div>

        {/* By month */}
        <div className="bg-white border border-stone-200 rounded-xl p-4">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">By Month</h3>
          <div className="space-y-2">
            {byMonth.map(({ month, count, avg }) => (
              <div key={month} className="flex items-center gap-3">
                <span className="text-xs text-stone-500 w-8 shrink-0">{month}</span>
                <div className="flex-1 bg-stone-100 rounded-full h-5 overflow-hidden">
                  <div
                    className="h-full bg-blue-400 rounded-full transition-all flex items-center justify-end pr-1"
                    style={{ width: maxMon ? `${(count / maxMon) * 100}%` : '0%' }}
                  >
                    {count > 0 && <span className="text-[9px] font-bold text-blue-900">{count}</span>}
                  </div>
                </div>
                {avg && <span className="text-xs text-stone-400 w-12 shrink-0 text-right">{avg} ★</span>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

// ── Language Breakdown ─────────────────────────────────────────────────────────
function LanguageBreakdown({ allReviews }) {
  const stats = useMemo(() => {
    const withText = allReviews.filter(r => r.review_text?.trim())
    let english = 0, spanish = 0
    withText.forEach(r => {
      if (detectLang(r.review_text) === 'Spanish') spanish++
      else english++
    })
    const total = withText.length || 1
    return { english, spanish, total, englishPct: (english/total*100).toFixed(1), spanishPct: (spanish/total*100).toFixed(1) }
  }, [allReviews])

  const byLoc = useMemo(() => {
    const locs = [...new Set(allReviews.map(r => r.location_name))]
    return locs.map(loc => {
      const revs = allReviews.filter(r => r.location_name === loc && r.review_text?.trim())
      const spanish = revs.filter(r => detectLang(r.review_text) === 'Spanish').length
      return { loc, total: revs.length, spanish, pct: revs.length ? +(spanish/revs.length*100).toFixed(0) : 0 }
    }).filter(d => d.total > 0).sort((a, b) => b.pct - a.pct)
  }, [allReviews])

  return (
    <section>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1 h-6 bg-violet-500 rounded-full" />
        <h2 className="text-lg font-bold text-stone-800">Language Detection</h2>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        Detects English vs Spanish reviews — helps prioritize bilingual responses.
      </p>

      {/* Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-blue-700">{stats.englishPct}%</p>
          <p className="text-sm text-blue-600 font-medium mt-1">English</p>
          <p className="text-xs text-stone-400">{stats.english.toLocaleString()} reviews</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
          <p className="text-3xl font-bold text-emerald-700">{stats.spanishPct}%</p>
          <p className="text-sm text-emerald-600 font-medium mt-1">Spanish</p>
          <p className="text-xs text-stone-400">{stats.spanish.toLocaleString()} reviews</p>
        </div>
      </div>

      {/* Per location Spanish % */}
      <h3 className="text-sm font-semibold text-stone-700 mb-3">Spanish review % by location</h3>
      <div className="space-y-2">
        {byLoc.map(({ loc, pct, spanish, total }) => (
          <div key={loc} className="flex items-center gap-3">
            <span className="text-xs text-stone-600 w-44 shrink-0 truncate" title={loc}>{loc.replace('Los Tres Amigos ','LTA ').replace('Los Tres Mex Grill ','LTMG ')}</span>
            <div className="flex-1 h-4 rounded-full overflow-hidden flex">
              <div className="h-full bg-blue-400 transition-all" style={{ width: `${100 - pct}%` }} />
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs text-stone-500 w-20 shrink-0 text-right">{pct}% · {spanish}/{total}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

// ── Source / Brand Breakdown ────────────────────────────────────────────────────
function SourceBreakdown({ allReviews }) {
  const brandStats = useMemo(() => {
    const map = {}
    allReviews.forEach(r => {
      const b = getBrand(r.location_name)
      if (!map[b]) map[b] = { brand: b, count: 0, sum: 0 }
      map[b].count++
      map[b].sum += Number(r.star_rating)
    })
    return Object.values(map)
      .map(d => ({ ...d, avg: +(d.sum / d.count).toFixed(2), color: getBrandColor(d.brand) }))
      .sort((a, b) => b.count - a.count)
  }, [allReviews])

  const total = allReviews.length

  return (
    <section>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-1 h-6 bg-rose-500 rounded-full" />
        <h2 className="text-lg font-bold text-stone-800">Review Source Breakdown</h2>
      </div>
      <p className="text-sm text-stone-500 mb-4">
        All reviews are sourced from Google. Breakdown by brand group below.
      </p>

      <div className="grid sm:grid-cols-2 gap-4 mb-6">
        {brandStats.map(({ brand, count, avg, color }) => (
          <div key={brand} className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="font-semibold text-stone-800 text-sm">{brand}</p>
                <p className="text-xs text-stone-400">{count.toLocaleString()} reviews · {(count/total*100).toFixed(1)}% of total</p>
              </div>
              <span className="font-bold text-stone-700">{avg} ★</span>
            </div>
            <div className="w-full bg-stone-100 rounded-full h-2">
              <div className="h-2 rounded-full" style={{ width: `${count/total*100}%`, backgroundColor: color }} />
            </div>
          </div>
        ))}
      </div>

      <div className="bg-stone-50 border border-stone-200 rounded-xl p-4 text-sm text-stone-500">
        <strong className="text-stone-700">Data sources:</strong> {total.toLocaleString()} total reviews from Google Business Profile.
        Collected via Google Takeout exports and Google Maps scraping.
        Yelp, TripAdvisor and Facebook data not yet connected.
      </div>
    </section>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────────
export default function Insights({ allReviews }) {
  return (
    <div className="space-y-10">
      <StaffMentions   allReviews={allReviews} />
      <hr className="border-stone-200" />
      <PeakTimes       allReviews={allReviews} />
      <hr className="border-stone-200" />
      <LanguageBreakdown allReviews={allReviews} />
      <hr className="border-stone-200" />
      <SourceBreakdown allReviews={allReviews} />
    </div>
  )
}
