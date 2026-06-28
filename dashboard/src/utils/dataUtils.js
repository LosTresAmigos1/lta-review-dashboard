// ── Brand detection ───────────────────────────────────────────────────────────
export const BRANDS = ['Los Tres Amigos', 'Los Tres Mex Grill', 'Mi Lindo San Blas', 'Rio Luna']
const BRAND_COLORS  = {
  'Los Tres Amigos':    '#d97706',
  'Los Tres Mex Grill': '#0369a1',
  'Mi Lindo San Blas':  '#7c3aed',
  'Rio Luna':           '#be185d',
  'Other':              '#57534e',
}

export function getBrand(name) {
  for (const b of BRANDS) if (name.startsWith(b)) return b
  return 'Other'
}
export function getBrandColor(brand) { return BRAND_COLORS[brand] || BRAND_COLORS.Other }

export function isUnverified(locationName, city) {
  const knownBrand = BRANDS.some(b => locationName.startsWith(b))
  return !knownBrand || !city || city === 'Unknown' || city === ''
}

// ── Confidence ────────────────────────────────────────────────────────────────
export function getConfidence(n) {
  if (n === 0)  return { level: 0, label: 'Insufficient data', color: 'text-stone-400' }
  if (n < 5)    return { level: 1, label: 'Low confidence',    color: 'text-orange-500' }
  if (n < 10)   return { level: 2, label: 'Moderate',          color: 'text-yellow-600' }
  return                { level: 3, label: 'Good',             color: 'text-emerald-600' }
}

// ── Sentiment ─────────────────────────────────────────────────────────────────
export function getSentiment(reviews) {
  const n = reviews.length
  if (n === 0) return { n: 0, positiveN: 0, neutralN: 0, badN: 0, positive: 0, neutral: 0, bad: 0 }
  const positiveN = reviews.filter(r => r.star_rating >= 4).length
  const neutralN  = reviews.filter(r => r.star_rating === 3).length
  const badN      = reviews.filter(r => r.star_rating <= 2).length
  return {
    n, positiveN, neutralN, badN,
    positive: positiveN / n * 100,
    neutral:  neutralN  / n * 100,
    bad:      badN      / n * 100,
  }
}

// ── Formatting helpers ────────────────────────────────────────────────────────
export function fmtPct(v) {
  if (v == null || isNaN(v)) return '—'
  return v.toFixed(1) + '%'
}
export function fmtRating(v) {
  if (v == null || isNaN(v)) return '—'
  return v.toFixed(2)
}
export function stars(n) { return '★'.repeat(n) + '☆'.repeat(5 - n) }

// ── Date helpers ──────────────────────────────────────────────────────────────
export function parseYM(ym) {
  // 'YYYY-MM' → Date (1st of month)
  const [y, m] = ym.split('-').map(Number)
  return new Date(y, m - 1, 1)
}
export function toYM(d) {
  if (!d || typeof d !== 'string') return ''
  return d.slice(0, 7)
}
export function ymLabel(ym, isPartial, lastDate) {
  const [y, m] = ym.split('-').map(Number)
  const mn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1]
  if (isPartial) return `${mn} ${y} (through ${lastDate})`
  return `${mn} ${y}`
}

export function getDateBounds(reviews) {
  const dates = reviews.map(r => r.review_date).filter(Boolean).sort()
  return { min: dates[0] || '', max: dates[dates.length - 1] || '' }
}

export function getDefaultDateRange(reviews) {
  const { max } = getDateBounds(reviews)
  if (!max) return { start: '', end: '' }
  const latestYM = max.slice(0, 7)
  const now      = new Date()
  const curYM    = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  // If latest data is current month it's partial; else use it as complete month
  const isPartial = latestYM === curYM
  const defaultYM = isPartial
    ? (() => { const d = new Date(now.getFullYear(), now.getMonth() - 1, 1); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}` })()
    : latestYM
  const [y, m] = defaultYM.split('-').map(Number)
  const start  = `${defaultYM}-01`
  const end    = new Date(y, m, 0).toISOString().slice(0, 10)  // last day of month
  return { start, end, defaultYM, isPartial, latestDate: max }
}

// ── Filter reviews ────────────────────────────────────────────────────────────
export function filterReviews(reviews, { brands, locations, start, end, stars: starFilter }) {
  return reviews.filter(r => {
    if (brands    && brands.length    && !brands.includes(getBrand(r.location_name))) return false
    if (locations && locations.length && !locations.includes(r.location_name))        return false
    if (start && r.review_date < start) return false
    if (end   && r.review_date > end)   return false
    if (starFilter && starFilter.length && !starFilter.includes(r.star_rating)) return false
    return true
  })
}

// ── Monthly trend ─────────────────────────────────────────────────────────────
export function getMonthlyTrend(reviews) {
  const map = {}
  reviews.forEach(r => {
    const ym = toYM(r.review_date)
    if (!ym) return
    if (!map[ym]) map[ym] = { ym, sum: 0, count: 0 }
    map[ym].sum += r.star_rating
    map[ym].count++
  })
  return Object.values(map)
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .map(d => ({ ym: d.ym, count: d.count, avg: d.count > 0 ? +(d.sum / d.count).toFixed(2) : null }))
}

// ── Location stats ────────────────────────────────────────────────────────────
export function getLocationStats(allReviews, periodReviews) {
  const locs = [...new Set(allReviews.map(r => r.location_name))].sort()
  return locs.map(name => {
    const all    = allReviews.filter(r => r.location_name === name)
    const period = periodReviews.filter(r => r.location_name === name)
    const city   = all[0]?.city || ''
    const brand  = getBrand(name)
    const lifetimeRating = all.length ? +(all.reduce((s, r) => s + r.star_rating, 0) / all.length).toFixed(2) : null
    const periodSentiment = getSentiment(period)
    // Star breakdown 1-5 for period
    const starBreakdown = [1,2,3,4,5].map(s => ({ star: s, count: period.filter(r => r.star_rating === s).length }))
    // Sparkline: last 6 months
    const spark = buildSparkline(all)
    return {
      name, city, brand,
      lifetimeRating,
      lifetimeCount: all.length,
      periodSentiment,
      starBreakdown,
      confidence: getConfidence(period.length),
      isUnverified: isUnverified(name, city),
      spark,
    }
  })
}

function buildSparkline(reviews) {
  const map = {}
  reviews.forEach(r => {
    const ym = toYM(r.review_date)
    if (!map[ym]) map[ym] = { sum: 0, n: 0 }
    map[ym].sum += r.star_rating
    map[ym].n++
  })
  const sorted = Object.entries(map).sort((a, b) => a[0].localeCompare(b[0])).slice(-6)
  return sorted.map(([ym, d]) => ({ ym, avg: d.n > 0 ? +(d.sum / d.n).toFixed(2) : null }))
}

// ── Rankings ──────────────────────────────────────────────────────────────────
export function getRankings(periodReviews, prevReviews) {
  const locs = [...new Set([...periodReviews, ...prevReviews].map(r => r.location_name))]
  return locs.map(name => {
    const cur  = periodReviews.filter(r => r.location_name === name)
    const prev = prevReviews.filter(r => r.location_name === name)
    const curSent  = getSentiment(cur)
    const prevSent = getSentiment(prev)
    const curConf  = getConfidence(cur.length)
    const prevConf = getConfidence(prev.length)
    const canCompare = curConf.level >= 3 && prevConf.level >= 3
    const delta = canCompare ? +(curSent.positive - prevSent.positive).toFixed(1) : null
    return {
      name,
      brand: getBrand(name),
      curN: cur.length,
      prevN: prev.length,
      curPositive: curSent.positive,
      prevPositive: prevSent.positive,
      curConfidence: curConf,
      prevConfidence: prevConf,
      canCompare,
      delta,
    }
  }).sort((a, b) => b.curPositive - a.curPositive)
}

// ── Unique locations and brands from dataset ───────────────────────────────────
export function getUniqueLocations(reviews) {
  return [...new Set(reviews.map(r => r.location_name))].sort()
}
export function getUniqueBrands(reviews) {
  return [...new Set(reviews.map(r => getBrand(r.location_name)))].filter(b => b !== 'Other').sort()
}
