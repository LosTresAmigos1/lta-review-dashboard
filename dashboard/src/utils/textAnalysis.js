const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','must','shall',
  'to','of','in','for','on','with','at','by','from','up','about','into','through',
  'during','before','after','above','below','between','among','all','each','every',
  'both','few','more','most','other','some','such','no','nor','not','only','own',
  'same','so','than','too','very','just','but','and','or','if','as','it','its',
  'this','that','these','those','them','they','we','you','he','she','his','her',
  'our','your','their','my','i','me','us','him','also','there','here','when',
  'where','which','who','how','why','what','any','never','always','still','even',
  'get','got','go','went','came','come','can','like','really','always','actually',
  'back','out','over','well','came','ve','ll','re','s','t','m','d','didn','isn',
  'wasn','weren','wouldn','couldn','don','doesn','hasn','hadn','won','can\'t',
  'food','place','restaurant','time','service','staff','visit','came','went',
  'just','got','good','great','nice','bad','ok','okay','also','though','even',
  'always','never','still','now','then','again','too','very','much','many',
  'lot','little','bit','quite','pretty','really','definitely','absolutely',
])

const MENU_ITEMS = [
  'tacos','taco','enchiladas','enchilada','fajitas','fajita','burrito','burritos',
  'margarita','margaritas','chips','salsa','guacamole','nachos','quesadilla',
  'quesadillas','tamales','tamale','carnitas','carne asada','al pastor','pollo',
  'rice','beans','chimichanga','chimichangas','tostada','tostadas','torta','tortas',
  'menudo','pozole','birria','mole','churros','churro','sopas','sopa','chile relleno',
  'chile rellenos','flautas','flauta','taquitos','taquito','elote','horchata',
  'jarritos','tres leches','flan','street tacos','fish tacos','steak',
  'shrimp','chicken','pork','beef','queso','pico','cilantro','lime',
]

function tokenize(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))
}

function wordFreq(texts) {
  const freq = {}
  texts.forEach(t => {
    tokenize(t).forEach(w => { freq[w] = (freq[w] || 0) + 1 })
  })
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([word, count]) => ({ word, count }))
}

function findMenuItems(reviews) {
  const found = {}
  reviews.forEach(r => {
    if (!r.review_text) return
    const text = r.review_text.toLowerCase()
    MENU_ITEMS.forEach(item => {
      if (text.includes(item)) {
        if (!found[item]) found[item] = { item, count: 0, reviews: [] }
        found[item].count++
        if (found[item].reviews.length < 3) found[item].reviews.push(r)
      }
    })
  })
  return Object.values(found)
    .sort((a, b) => b.count - a.count)
    .slice(0, 8)
}

// Staff names: look for common patterns
const STAFF_PATTERNS = [
  /(?:our|my)\s+(?:server|waiter|waitress|bartender|host|manager|girl|guy)\s+([A-Z][a-z]+)/g,
  /(?:server|waiter|waitress|bartender|host|manager)\s+(?:named?\s+)?([A-Z][a-z]+)/g,
  /(?:ask for|ask for our|shoutout to|thanks? to|kudos to|great job)\s+([A-Z][a-z]+)/g,
  /([A-Z][a-z]+)\s+(?:was our|is our|helped us|was amazing|was great|was wonderful|was fantastic|was awesome)/g,
]

// Common capitalized words that match the staff-name patterns but aren't names
// (languages, days/months, generic adjectives, etc.)
const NAME_DENYLIST = new Set([
  'english','spanish','mexican','american','great','good','amazing','awesome',
  'wonderful','fantastic','excellent','perfect','friendly','attentive','quick',
  'fast','slow','rude','nice','super','very','extremely','always','definitely',
  'absolutely','overall','honestly','seriously','today','yesterday','monday',
  'tuesday','wednesday','thursday','friday','saturday','sunday','january',
  'february','march','april','may','june','july','august','september',
  'october','november','december','manager','server','waiter','waitress',
  'bartender','host','hostess',
])

function findStaffNames(reviews) {
  const counts = {}
  const byName = {}
  reviews.forEach(r => {
    const text = r.review_text
    if (!text) return
    STAFF_PATTERNS.forEach(pattern => {
      const re = new RegExp(pattern.source, 'g')
      let m
      while ((m = re.exec(text)) !== null) {
        const name = m[1]
        if (!name || name.length < 2) continue
        if (NAME_DENYLIST.has(name.toLowerCase())) continue
        if (!counts[name]) { counts[name] = 0; byName[name] = [] }
        counts[name]++
        if (byName[name].length < 3) byName[name].push(r)
      }
    })
  })
  return Object.entries(counts)
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, count]) => ({ name, count, reviews: byName[name] }))
}

function topThemes(reviews, topN = 8) {
  const freq = wordFreq(reviews.map(r => r.review_text).filter(Boolean))
  // map back to supporting reviews
  return freq.slice(0, topN).map(({ word, count }) => ({
    theme: word,
    count,
    reviews: reviews.filter(r => r.review_text && r.review_text.toLowerCase().includes(word)).slice(0, 3),
  }))
}

export function extractInsights(reviews) {
  const positive = reviews.filter(r => r.star_rating >= 4)
  const negative = reviews.filter(r => r.star_rating <= 2)
  return {
    positiveThemes: topThemes(positive),
    complaints:     topThemes(negative),
    staffNames:     findStaffNames(reviews),
    menuItems:      findMenuItems(reviews),
  }
}
