import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const csvPath   = path.join(__dirname, '..', 'reviews.csv')
const outDir    = path.join(__dirname, '..', 'src', 'data')
const outPath   = path.join(outDir, 'reviews.json')

// ── CSV parser (handles quoted fields with embedded commas / newlines) ────────
function parseCSV(raw) {
  const rows = []
  let i = 0
  let headers = null

  function parseRow() {
    const fields = []
    while (i < raw.length) {
      if (raw[i] === '"') {
        // quoted field
        i++ // skip opening quote
        let val = ''
        while (i < raw.length) {
          if (raw[i] === '"' && raw[i + 1] === '"') { val += '"'; i += 2 }
          else if (raw[i] === '"') { i++; break }
          else { val += raw[i++] }
        }
        fields.push(val)
      } else {
        let val = ''
        while (i < raw.length && raw[i] !== ',' && raw[i] !== '\n' && raw[i] !== '\r') {
          val += raw[i++]
        }
        fields.push(val.trim())
      }
      if (i < raw.length && raw[i] === ',') { i++; continue }
      break
    }
    // skip \r\n or \n
    if (i < raw.length && raw[i] === '\r') i++
    if (i < raw.length && raw[i] === '\n') i++
    return fields
  }

  headers = parseRow()
  while (i < raw.length) {
    const fields = parseRow()
    if (fields.length === 0 || (fields.length === 1 && fields[0] === '')) continue
    const row = {}
    headers.forEach((h, idx) => { row[h] = fields[idx] ?? '' })
    rows.push(row)
  }
  return rows
}

// Extracts the underlying Google review ID regardless of which URL format
// produced it (Takeout/API uses ?placeid=, the Playwright scraper uses /reviews/<id>),
// so the same review scraped via different pipelines dedupes correctly.
function canonicalReviewId(url) {
  if (!url) return null
  let m = url.match(/placeid=([^&]+)/)
  if (m) return m[1]
  m = url.match(/\/reviews\/([^/?]+)/)
  if (m) return m[1]
  return null
}

// The Playwright scraper sometimes captures the UI label instead of the real reply text.
const OWNER_RESPONSE_PLACEHOLDER = /^response from the owner$/i

// ── run ───────────────────────────────────────────────────────────────────────
const raw     = fs.readFileSync(csvPath, 'utf-8')
const parsed  = parseCSV(raw)

const allRows = parsed
  .map(r => {
    const owner_response = r.owner_response || ''
    return {
      location_name:  r.location_name  || '',
      city:           r.city           || '',
      reviewer_name:  r.reviewer_name  || '',
      review_date:    r.review_date    || '',
      star_rating:    parseInt(r.star_rating, 10) || 0,
      review_text:    r.review_text    || '',
      owner_response: OWNER_RESPONSE_PLACEHOLDER.test(owner_response.trim()) ? '' : owner_response,
      review_url:     r.review_url     || '',
    }
  })
  .filter(r => r.star_rating >= 1 && r.star_rating <= 5 && /^\d{4}-\d{2}-\d{2}$/.test(r.review_date))

// Dedup by canonical review ID (falls back to a content key when no URL is present),
// keeping whichever duplicate row is more complete (has an owner response, longer text).
function rowScore(r) {
  return (r.owner_response ? 2 : 0) + (r.review_text ? 1 : 0)
}

const bestByKey = new Map()
for (const r of allRows) {
  const key = canonicalReviewId(r.review_url) ||
    `${r.location_name}|${r.reviewer_name}|${r.review_date}|${r.star_rating}`
  const existing = bestByKey.get(key)
  if (!existing || rowScore(r) > rowScore(existing)) bestByKey.set(key, r)
}
const reviews = [...bestByKey.values()]
const duplicateCount = allRows.length - reviews.length

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(reviews))

// ── sanity check ──────────────────────────────────────────────────────────────
const byLocation = {}
reviews.forEach(r => { byLocation[r.location_name] = (byLocation[r.location_name] || 0) + 1 })
const sorted = reviews.map(r => r.review_date).sort()
const latestDate  = sorted[sorted.length - 1] || ''
const latestYM    = latestDate.slice(0, 7)
const latestCount = reviews.filter(r => r.review_date.startsWith(latestYM)).length

console.log(`✓ ${reviews.length} reviews · ${Object.keys(byLocation).length} locations · JSON: ${(fs.statSync(outPath).size / 1024).toFixed(0)} KB`)
if (duplicateCount > 0) console.log(`✓ Removed ${duplicateCount} duplicate review(s) during build`)
console.log(`✓ Latest month ${latestYM}: ${latestCount} reviews`)
Object.entries(byLocation)
  .sort((a,b) => b[1]-a[1])
  .forEach(([loc, n]) => console.log(`  ${n.toString().padStart(5)}  ${loc}`))
