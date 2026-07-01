"""
refresh_analytics.py — Analytics, Complaint Intelligence & AI Summaries.

Pipeline step 3: reads reviews.db, computes all intelligence (complaint
categories, employee mentions, sentiment trends, predictions, AI summaries)
and writes results to analytics_cache so export_chunks.py can ship
precomputed JSON to the static frontend.
"""
import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timedelta, timezone

import db
import ai_engine

# ---------------------------------------------------------------------------
# Complaint / praise classification — 15 operational categories each
# ---------------------------------------------------------------------------

# Each entry: (category_id, display_name, keywords/phrases, severity 1-3)
COMPLAINT_CATEGORIES = [
    ("wait_time",       "Long Wait Times",        3, [
        "long wait", "waited", "waiting too long", "took forever", "took too long",
        "45 minutes", "hour wait", "30 minute wait", "20 minute wait", "wait time",
        "waited over", "slow to seat", "seating wait", "took ages", "still waiting",
    ]),
    ("slow_service",    "Slow Service",           2, [
        "slow service", "slow waiter", "slow waitress", "slow server",
        "forgot our order", "forgot my order", "never came back",
        "had to ask", "waited for drinks", "waited for refill",
        "slow to bring", "slow to take", "long time for",
    ]),
    ("poor_service",    "Poor Customer Service",  3, [
        "rude", "unfriendly", "disrespectful", "dismissive", "condescending",
        "bad attitude", "poor attitude", "attitude problem", "unprofessional",
        "ignored us", "ignored me", "ignored our", "not attentive", "inattentive",
        "poor customer service", "terrible service", "horrible service",
        "worst service", "bad service",
    ]),
    ("cold_food",       "Cold Food",              2, [
        "cold food", "food was cold", "food is cold", "came out cold",
        "arrived cold", "lukewarm", "not hot", "not warm enough", "stone cold",
        "cold when", "cold plate", "cold dishes",
    ]),
    ("wrong_order",     "Order Errors",           2, [
        "wrong order", "wrong dish", "wrong item", "wrong food",
        "not what i ordered", "not what we ordered", "missing item",
        "missing order", "didn't get", "never received", "order was wrong",
        "messed up our order", "messed up my order", "incorrect order",
    ]),
    ("food_quality",    "Food Quality",           3, [
        "bland", "tasteless", "no flavor", "no taste", "flavorless",
        "overcooked", "undercooked", "not fresh", "stale", "mushy",
        "soggy", "greasy", "too salty", "too spicy for", "disgusting food",
        "terrible food", "horrible food", "worst food", "bad food",
        "dry", "rubbery", "tough meat", "chewy", "burnt",
    ]),
    ("cleanliness",     "Cleanliness",            3, [
        "dirty", "unclean", "filthy", "grimy", "gross", "disgusting",
        "sticky table", "dirty table", "sticky floor", "dirty floor",
        "dirty dishes", "trash", "dusty", "needed cleaning", "not clean",
        "dirty restaurant",
    ]),
    ("restrooms",       "Restroom Issues",        2, [
        "dirty bathroom", "filthy bathroom", "disgusting bathroom",
        "dirty restroom", "filthy restroom", "bathroom was gross",
        "restroom was", "bathroom needs", "out of paper",
        "bathroom smelled", "toilet was",
    ]),
    ("pricing",         "Pricing & Value",        2, [
        "overpriced", "too expensive", "not worth the price", "not worth the money",
        "small portions for the price", "charge too much", "way too much",
        "price has gone up", "prices went up", "used to be cheaper",
        "not worth it", "poor value", "not a good value",
    ]),
    ("noise",           "Noise & Environment",    1, [
        "too loud", "very loud", "extremely loud", "loud music",
        "could not hear", "couldn't hear", "hard to hear",
        "music too loud", "noisy", "so loud", "deafening",
    ]),
    ("management",      "Management Issues",      3, [
        "poorly managed", "poor management", "bad management",
        "manager was rude", "manager had attitude", "manager didn't help",
        "need better management", "disorganized", "chaotic",
        "no manager", "manager was unhelpful",
    ]),
    ("drink_quality",   "Drink Quality",          2, [
        "watery margarita", "watery drinks", "weak drinks", "weak margaritas",
        "bad margarita", "terrible margarita", "tasteless margarita",
        "margarita was bad", "drinks were bad", "flat soda", "warm beer",
    ]),
    ("parking",         "Parking & Location",     1, [
        "no parking", "hard to park", "parking lot", "parking was",
        "difficult to find parking", "parking issue",
    ]),
    ("reservation",     "Seating & Reservations", 1, [
        "reservation was lost", "lost our reservation", "didn't honor",
        "couldn't find our reservation", "wait despite reservation",
        "sat us at a bad table", "table wasn't ready",
    ]),
    ("consistency",     "Inconsistent Quality",   2, [
        "inconsistent", "hit or miss", "used to be better", "gone downhill",
        "not as good as", "not what it used to", "quality has dropped",
        "quality went down", "used to love", "was better before",
    ]),
]

PRAISE_CATEGORIES = [
    ("friendly_staff",   "Friendly Staff",          [
        "friendly staff", "friendly service", "friendly server",
        "kind staff", "nice staff", "warm staff", "welcoming staff",
        "friendly and", "so friendly", "very friendly", "extremely friendly",
        "attentive server", "attentive staff", "attentive waitress", "attentive waiter",
    ]),
    ("fast_service",     "Fast & Efficient Service",[
        "fast service", "quick service", "prompt service", "efficient service",
        "came out quickly", "came out fast", "arrived quickly", "out fast",
        "great service", "excellent service", "outstanding service",
        "wonderful service", "service was great", "service was excellent",
    ]),
    ("great_margaritas", "Great Margaritas",        [
        "best margarita", "amazing margarita", "great margarita",
        "delicious margarita", "love the margaritas", "margaritas are amazing",
        "margaritas were great", "margaritas were excellent", "the margaritas",
        "perfect margarita", "strong margarita",
    ]),
    ("great_food",       "Delicious Food",          [
        "delicious", "amazing food", "great food", "excellent food",
        "food was amazing", "food was great", "food was delicious",
        "food was fantastic", "food is amazing", "loved the food",
        "best food", "incredible food",
    ]),
    ("great_tacos",      "Great Tacos",             [
        "best tacos", "amazing tacos", "great tacos", "delicious tacos",
        "love the tacos", "tacos are amazing", "tacos were great",
        "tacos were delicious", "tacos are the best",
    ]),
    ("authentic",        "Authentic Cuisine",       [
        "authentic", "authentic mexican", "authentic food", "authentic flavors",
        "traditional", "real mexican", "genuine", "tastes like mexico",
        "homestyle", "home cooked", "abuela's", "fresh ingredients",
    ]),
    ("family_friendly",  "Family-Friendly",         [
        "great for families", "family friendly", "family atmosphere",
        "kids loved it", "great with kids", "family restaurant",
        "brought the whole family", "family dinner", "kids menu",
    ]),
    ("great_value",      "Great Value",             [
        "great value", "good value", "worth the price", "affordable",
        "reasonable price", "reasonable prices", "not expensive",
        "great price", "good price", "fair price", "priced well",
        "large portions", "generous portions", "huge portions",
    ]),
    ("great_atmosphere", "Great Atmosphere",        [
        "great atmosphere", "love the atmosphere", "beautiful decor",
        "great ambiance", "nice ambiance", "cozy", "beautiful restaurant",
        "nice decor", "love the decor", "vibrant atmosphere",
    ]),
    ("special_occasion", "Special Occasion Excellence",[
        "birthday", "anniversary", "celebration", "special occasion",
        "made it special", "went above and beyond", "made us feel special",
        "treated us like", "special experience",
    ]),
]

# ---------------------------------------------------------------------------
# Negation detection
# ---------------------------------------------------------------------------

_NEGATION_RE = re.compile(
    r"\b(not|no|never|nothing|wasn'?t|isn'?t|aren'?t|weren'?t|didn'?t|don'?t|doesn'?t|hardly|barely|without)\b",
    re.IGNORECASE,
)


def _has_negation_near(text: str, phrase: str, window: int = 6) -> bool:
    """Return True if a negation word appears within `window` words of `phrase`."""
    idx = text.lower().find(phrase)
    if idx == -1:
        return False
    before = text[max(0, idx - 60) : idx].lower()
    words_before = before.split()[-window:]
    return bool(_NEGATION_RE.search(" ".join(words_before)))


def classify_review(text: str, star_rating: int | None) -> dict:
    """
    Returns {"complaints": [...category_ids], "praises": [...category_ids]}
    for a single review.
    """
    if not text:
        text = ""
    tl = text.lower()

    complaints = []
    if star_rating is None or star_rating <= 3:
        for cat_id, _name, _sev, phrases in COMPLAINT_CATEGORIES:
            for phrase in phrases:
                if phrase in tl and not _has_negation_near(tl, phrase):
                    complaints.append(cat_id)
                    break

    praises = []
    if star_rating is None or star_rating >= 3:
        for cat_id, _name, phrases in PRAISE_CATEGORIES:
            for phrase in phrases:
                if phrase in tl and not _has_negation_near(tl, phrase):
                    praises.append(cat_id)
                    break

    return {"complaints": complaints, "praises": praises}


# ---------------------------------------------------------------------------
# Aggregate complaint/praise intelligence
# ---------------------------------------------------------------------------

COMPLAINT_META = {c[0]: {"name": c[1], "severity": c[2]} for c in COMPLAINT_CATEGORIES}
PRAISE_META    = {p[0]: {"name": p[1]}                    for p in PRAISE_CATEGORIES}


def build_complaint_intelligence(reviews: list, period_reviews: list, prev_reviews: list) -> dict:
    """
    Returns categorized complaint and praise intelligence with trends.
    """
    def _score_period(rev_list: list) -> dict:
        complaint_counts = Counter()
        praise_counts = Counter()
        complaint_reviews = defaultdict(list)
        praise_reviews = defaultdict(list)

        for r in rev_list:
            tags = classify_review(r.get("review_text") or "", r.get("star_rating"))
            for c in tags["complaints"]:
                complaint_counts[c] += 1
                if len(complaint_reviews[c]) < 3:
                    complaint_reviews[c].append({
                        "reviewer_name": r.get("reviewer_name"),
                        "review_text": (r.get("review_text") or "")[:200],
                        "review_date": r.get("review_date"),
                        "star_rating": r.get("star_rating"),
                        "location_name": r.get("location_name"),
                    })
            for p in tags["praises"]:
                praise_counts[p] += 1
                if len(praise_reviews[p]) < 3:
                    praise_reviews[p].append({
                        "reviewer_name": r.get("reviewer_name"),
                        "review_text": (r.get("review_text") or "")[:200],
                        "review_date": r.get("review_date"),
                        "star_rating": r.get("star_rating"),
                        "location_name": r.get("location_name"),
                    })

        return complaint_counts, complaint_reviews, praise_counts, praise_reviews

    cc_cur, cr_cur, pc_cur, pr_cur = _score_period(period_reviews)
    cc_prev, _, pc_prev, _          = _score_period(prev_reviews)

    total_period = max(1, len(period_reviews))

    complaints_out = []
    for cat_id, meta in COMPLAINT_META.items():
        cur_n = cc_cur.get(cat_id, 0)
        prev_n = cc_prev.get(cat_id, 0)
        if cur_n == 0 and prev_n == 0:
            continue
        pct = cur_n / total_period * 100
        delta = cur_n - prev_n
        trend = "up" if delta > 1 else "down" if delta < -1 else "stable"

        # Which locations are most affected
        loc_counts = Counter(
            ex.get("location_name") for ex in cr_cur.get(cat_id, [])
        )

        complaints_out.append({
            "id": cat_id,
            "name": meta["name"],
            "severity": meta["severity"],
            "count": cur_n,
            "prevCount": prev_n,
            "pct": round(pct, 1),
            "delta": delta,
            "trend": trend,
            "topLocations": [{"name": n, "count": c} for n, c in loc_counts.most_common(3)],
            "examples": cr_cur.get(cat_id, []),
        })

    complaints_out.sort(key=lambda x: (-x["severity"], -x["count"]))

    praises_out = []
    for cat_id, meta in PRAISE_META.items():
        cur_n = pc_cur.get(cat_id, 0)
        prev_n = pc_prev.get(cat_id, 0)
        if cur_n == 0 and prev_n == 0:
            continue
        pct = cur_n / total_period * 100
        delta = cur_n - prev_n
        trend = "up" if delta > 1 else "down" if delta < -1 else "stable"

        praises_out.append({
            "id": cat_id,
            "name": meta["name"],
            "count": cur_n,
            "prevCount": prev_n,
            "pct": round(pct, 1),
            "delta": delta,
            "trend": trend,
            "examples": pr_cur.get(cat_id, []),
        })

    praises_out.sort(key=lambda x: -x["count"])

    return {"complaints": complaints_out, "praises": praises_out}


# ---------------------------------------------------------------------------
# Predictive analytics — simple linear trend on last 90 days
# ---------------------------------------------------------------------------

def predict_rating(reviews: list, days_ahead: int = 30) -> float | None:
    """
    Linear regression on monthly average ratings → project `days_ahead` forward.
    Returns projected rating (clamped 1.0–5.0) or None if insufficient data.
    """
    buckets = {}
    for r in reviews:
        if not r.get("review_date") or r.get("star_rating") is None:
            continue
        ym = r["review_date"][:7]
        b = buckets.setdefault(ym, {"sum": 0, "count": 0})
        b["sum"] += r["star_rating"]
        b["count"] += 1

    months = sorted(buckets.keys())
    if len(months) < 3:
        return None

    recent = months[-6:]  # use last 6 months for trend
    xs = list(range(len(recent)))
    ys = [buckets[m]["sum"] / buckets[m]["count"] for m in recent]

    n = len(xs)
    sx, sy = sum(xs), sum(ys)
    sxy = sum(x * y for x, y in zip(xs, ys))
    sxx = sum(x * x for x in xs)

    denom = n * sxx - sx * sx
    if denom == 0:
        return None

    slope = (n * sxy - sx * sy) / denom
    intercept = (sy - slope * sx) / n

    # Project ~1 month ahead
    x_future = len(recent) - 1 + (days_ahead / 30)
    predicted = intercept + slope * x_future
    return round(max(1.0, min(5.0, predicted)), 2)


def predict_volume(reviews: list, days_ahead: int = 30) -> int | None:
    """Project review volume for the next `days_ahead` days."""
    if not reviews:
        return None
    today = datetime.now(timezone.utc).date()
    d30 = (today - timedelta(days=30)).isoformat()
    d60 = (today - timedelta(days=60)).isoformat()

    cur30  = sum(1 for r in reviews if r.get("review_date") and r["review_date"] >= d30)
    prev30 = sum(1 for r in reviews if r.get("review_date") and d60 <= r["review_date"] < d30)

    if prev30 == 0:
        return cur30

    growth = cur30 / prev30
    projected = round(cur30 * growth * (days_ahead / 30))
    return max(0, projected)


def rating_trend_alert(reviews: list, location_name: str) -> dict | None:
    """
    Returns an alert dict if the location's rating is declining significantly.
    """
    pred = predict_rating(reviews, days_ahead=30)
    if pred is None:
        return None

    recent = [r for r in reviews if r.get("review_date") and r.get("star_rating") is not None]
    if not recent:
        return None

    current = sum(r["star_rating"] for r in recent[-20:]) / min(len(recent), 20)

    if pred < 4.0 and current >= 4.0:
        return {
            "type": "rating_drop_warning",
            "location": location_name,
            "current": round(current, 2),
            "predicted": pred,
            "message": f"{location_name} is projected to drop below 4.0★ within 30 days (currently {current:.2f}★).",
        }
    if pred < current - 0.3:
        return {
            "type": "rating_declining",
            "location": location_name,
            "current": round(current, 2),
            "predicted": pred,
            "message": f"{location_name} shows a declining trend ({current:.2f}★ → projected {pred:.2f}★).",
        }
    return None


# ---------------------------------------------------------------------------
# Existing helpers (sentiment, confidence, trends, staff, etc.)
# ---------------------------------------------------------------------------

STOP_WORDS = {
    'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
    'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'up', 'about', 'into', 'through',
    'during', 'before', 'after', 'above', 'below', 'between', 'among', 'all', 'each', 'every',
    'both', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
    'same', 'so', 'than', 'too', 'very', 'just', 'but', 'and', 'or', 'if', 'as', 'it', 'its',
    'this', 'that', 'these', 'those', 'them', 'they', 'we', 'you', 'he', 'she', 'his', 'her',
    'our', 'your', 'their', 'my', 'i', 'me', 'us', 'him', 'also', 'there', 'here', 'when',
    'where', 'which', 'who', 'how', 'why', 'what', 'any', 'never', 'always', 'still', 'even',
    'get', 'got', 'go', 'went', 'came', 'come', 'can', 'like', 'really', 'actually',
    'back', 'out', 'over', 'well', 've', 'll', 're', 's', 't', 'm', 'd',
    'food', 'place', 'restaurant', 'time', 'service', 'staff', 'visit',
    'good', 'great', 'nice', 'bad', 'ok', 'okay', 'though',
    'now', 'then', 'again', 'much', 'many', 'lot', 'little', 'bit', 'quite', 'pretty',
    'definitely', 'absolutely',
}

MENU_ITEMS = [
    'tacos', 'taco', 'enchiladas', 'enchilada', 'fajitas', 'fajita', 'burrito', 'burritos',
    'margarita', 'margaritas', 'chips', 'salsa', 'guacamole', 'nachos', 'quesadilla',
    'quesadillas', 'tamales', 'tamale', 'carnitas', 'carne asada', 'al pastor', 'pollo',
    'rice', 'beans', 'chimichanga', 'chimichangas', 'tostada', 'tostadas', 'torta', 'tortas',
    'menudo', 'pozole', 'birria', 'mole', 'churros', 'churro', 'flautas', 'flauta',
    'taquitos', 'taquito', 'elote', 'horchata', 'tres leches', 'flan',
    'street tacos', 'fish tacos', 'steak', 'shrimp', 'chicken', 'pork', 'beef',
    'queso', 'pico', 'cilantro', 'lime',
]

STAFF_PATTERNS = [
    re.compile(r'(?:our|my)\s+(?:server|waiter|waitress|bartender|host|manager|girl|guy)\s+([A-Z][a-z]+)'),
    re.compile(r'(?:server|waiter|waitress|bartender|host|manager)\s+(?:named?\s+)?([A-Z][a-z]+)'),
    re.compile(r'(?:ask for|shoutout to|thanks? to|kudos to)\s+([A-Z][a-z]+)'),
    re.compile(r'([A-Z][a-z]+)\s+(?:was our|is our|helped us|was amazing|was great|was wonderful|was fantastic|was awesome|was so helpful|was incredibly)'),
]

NAME_DENYLIST = {
    'english', 'spanish', 'mexican', 'american', 'great', 'good', 'amazing', 'awesome',
    'wonderful', 'fantastic', 'excellent', 'perfect', 'friendly', 'attentive', 'quick',
    'fast', 'slow', 'rude', 'nice', 'super', 'very', 'extremely', 'always', 'definitely',
    'absolutely', 'overall', 'honestly', 'seriously', 'today', 'yesterday', 'monday',
    'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january',
    'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
    'october', 'november', 'december', 'manager', 'server', 'waiter', 'waitress',
    'bartender', 'host', 'hostess', 'highly', 'totally', 'usually', 'normally',
    'recently', 'forever', 'family', 'table', 'party', 'group', 'order', 'everything',
}

_WORD_RE = re.compile(r"[^a-z0-9\s']")


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")


def tokenize(text: str) -> list:
    text = _WORD_RE.sub(" ", text.lower())
    return [w for w in text.split() if len(w) > 2 and w not in STOP_WORDS]


def word_freq(texts: list, limit: int = 20) -> list:
    freq = Counter()
    for t in texts:
        freq.update(tokenize(t))
    return [{"word": w, "count": c} for w, c in freq.most_common(limit)]


def find_menu_items(reviews: list, top_n: int = 8) -> list:
    found = {}
    for r in reviews:
        text = (r.get("review_text") or "").lower()
        if not text:
            continue
        for item in MENU_ITEMS:
            if item in text:
                slot = found.setdefault(item, {"item": item, "count": 0, "reviews": []})
                slot["count"] += 1
                if len(slot["reviews"]) < 3:
                    slot["reviews"].append({
                        "reviewer_name": r.get("reviewer_name"),
                        "review_text": r.get("review_text"),
                    })
    return sorted(found.values(), key=lambda x: -x["count"])[:top_n]


def find_staff_names(reviews: list, top_n: int = 10) -> list:
    counts = Counter()
    by_name = {}
    positive_names = set()
    negative_names = set()

    for r in reviews:
        text = r.get("review_text") or ""
        if not text:
            continue
        stars = r.get("star_rating") or 3
        for pattern in STAFF_PATTERNS:
            for m in pattern.finditer(text):
                name = m.group(1)
                if not name or len(name) < 2 or name.lower() in NAME_DENYLIST:
                    continue
                counts[name] += 1
                by_name.setdefault(name, [])
                if len(by_name[name]) < 3:
                    by_name[name].append({
                        "reviewer_name": r.get("reviewer_name"),
                        "review_text": text,
                        "star_rating": stars,
                    })
                if stars >= 4:
                    positive_names.add(name)
                elif stars <= 2:
                    negative_names.add(name)

    return [
        {
            "name": name,
            "count": c,
            "sentiment": "negative" if name in negative_names and name not in positive_names
                          else "positive" if name in positive_names else "mixed",
            "reviews": by_name[name],
        }
        for name, c in counts.most_common() if c >= 2
    ][:top_n]


def sentiment(reviews: list) -> dict:
    n = len(reviews)
    if n == 0:
        return {"n": 0, "positiveN": 0, "neutralN": 0, "badN": 0,
                "positive": 0, "neutral": 0, "bad": 0, "avgRating": None}
    rated = [r for r in reviews if r.get("star_rating") is not None]
    positive_n = sum(1 for r in reviews if (r.get("star_rating") or 0) >= 4)
    neutral_n  = sum(1 for r in reviews if r.get("star_rating") == 3)
    bad_n      = sum(1 for r in reviews if (r.get("star_rating") or 0) and r["star_rating"] <= 2)
    avg = round(sum(r["star_rating"] for r in rated) / len(rated), 2) if rated else None
    return {
        "n": n, "positiveN": positive_n, "neutralN": neutral_n, "badN": bad_n,
        "positive": positive_n / n * 100, "neutral": neutral_n / n * 100,
        "bad": bad_n / n * 100, "avgRating": avg,
    }


def confidence(n: int) -> dict:
    if n == 0:     return {"level": 0, "label": "No data"}
    if n < 5:      return {"level": 1, "label": "Low confidence"}
    if n < 15:     return {"level": 2, "label": "Moderate"}
    return             {"level": 3, "label": "High confidence"}


def monthly_trend(reviews: list) -> list:
    buckets = {}
    for r in reviews:
        if not r.get("review_date") or r.get("star_rating") is None:
            continue
        ym = r["review_date"][:7]
        b = buckets.setdefault(ym, {"sum": 0, "count": 0})
        b["sum"]   += r["star_rating"]
        b["count"] += 1
    return [
        {"ym": ym, "count": b["count"],
         "avg": round(b["sum"] / b["count"], 2) if b["count"] else None}
        for ym, b in sorted(buckets.items())
    ]


def compute_health_score(reviews_all: list, reviews_30d: list) -> dict:
    """
    Composite 0-100 health score weighted:
      40% average rating (30d)
      25% sentiment (% positive, 30d)
      20% response rate (unresponded / total)
      15% trend (rating delta 30d vs 60d)
    """
    rated_30 = [r for r in reviews_30d if r.get("star_rating") is not None]
    if not rated_30:
        return {"score": None, "grade": "N/A", "breakdown": {}}

    avg_30 = sum(r["star_rating"] for r in rated_30) / len(rated_30)

    today  = datetime.now(timezone.utc).date().isoformat()
    d30    = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    d60    = (datetime.now(timezone.utc) - timedelta(days=60)).date().isoformat()

    prev_30 = [r for r in reviews_all if r.get("review_date") and d60 <= r["review_date"] < d30
               and r.get("star_rating") is not None]
    prev_avg = sum(r["star_rating"] for r in prev_30) / len(prev_30) if prev_30 else avg_30

    # 1. Rating component (40 pts)
    rating_score = max(0, min(40, ((avg_30 - 1) / 4) * 40))

    # 2. Sentiment component (25 pts)
    sent = sentiment(reviews_30d)
    sentiment_score = max(0, min(25, sent["positive"] / 100 * 25))

    # 3. Response rate component (20 pts) — higher unanswered = lower score
    negative_30 = [r for r in reviews_30d if (r.get("star_rating") or 5) <= 2]
    unanswered  = sum(1 for r in negative_30 if not (r.get("owner_response") or "").strip())
    if negative_30:
        response_rate = 1 - (unanswered / len(negative_30))
    else:
        response_rate = 1.0
    response_score = max(0, min(20, response_rate * 20))

    # 4. Trend component (15 pts)
    delta = avg_30 - prev_avg
    trend_score = max(0, min(15, 7.5 + delta * 15))

    total = round(rating_score + sentiment_score + response_score + trend_score)

    if total >= 85:   grade = "A"
    elif total >= 70: grade = "B"
    elif total >= 55: grade = "C"
    elif total >= 40: grade = "D"
    else:             grade = "F"

    return {
        "score": total,
        "grade": grade,
        "breakdown": {
            "rating": round(rating_score),
            "sentiment": round(sentiment_score),
            "responseRate": round(response_score),
            "trend": round(trend_score),
        },
        "avgRating30d": round(avg_30, 2),
        "ratingDelta": round(avg_30 - prev_avg, 2),
    }


def location_stats(all_reviews: list, period_reviews: list, locations: dict) -> list:
    by_loc_all    = defaultdict(list)
    by_loc_period = defaultdict(list)
    for r in all_reviews:
        by_loc_all[r["location_id"]].append(r)
    for r in period_reviews:
        by_loc_period[r["location_id"]].append(r)

    out = []
    for loc_id, loc in locations.items():
        all_r    = by_loc_all[loc_id]
        period_r = by_loc_period[loc_id]
        rated    = [r for r in all_r if r.get("star_rating") is not None]
        lifetime_rating = round(sum(r["star_rating"] for r in rated) / len(rated), 2) if rated else None
        star_breakdown  = [{"star": s, "count": sum(1 for r in period_r if r.get("star_rating") == s)}
                           for s in range(1, 6)]
        health  = compute_health_score(all_r, period_r)
        predict = predict_rating(all_r)
        out.append({
            "name": loc["name"], "city": loc["city"], "brand": loc["brand"],
            "lifetimeRating": lifetime_rating, "lifetimeCount": len(all_r),
            "periodSentiment": sentiment(period_r), "starBreakdown": star_breakdown,
            "confidence": confidence(len(period_r)),
            "isUnverified": (not loc.get("brand") or loc["brand"] == "Other"
                             or not loc.get("city") or loc["city"] == "Unknown"),
            "spark": monthly_trend(all_r)[-6:],
            "healthScore": health,
            "predictedRating": predict,
        })
    return out


def rankings(period_reviews: list, prev_reviews: list, locations: dict) -> list:
    by_loc_period = defaultdict(list)
    by_loc_prev   = defaultdict(list)
    for r in period_reviews:
        by_loc_period[r["location_id"]].append(r)
    for r in prev_reviews:
        by_loc_prev[r["location_id"]].append(r)

    out = []
    for loc_id in set(by_loc_period) | set(by_loc_prev):
        loc = locations.get(loc_id)
        if not loc:
            continue
        cur, prev = by_loc_period[loc_id], by_loc_prev[loc_id]
        cur_sent, prev_sent = sentiment(cur), sentiment(prev)
        cur_conf, prev_conf = confidence(len(cur)), confidence(len(prev))
        can_compare = cur_conf["level"] >= 2 and prev_conf["level"] >= 2
        delta = round(cur_sent["positive"] - prev_sent["positive"], 1) if can_compare else None
        avg_delta = (
            round(cur_sent["avgRating"] - prev_sent["avgRating"], 2)
            if can_compare and cur_sent["avgRating"] and prev_sent["avgRating"] else None
        )
        out.append({
            "name": loc["name"], "brand": loc["brand"],
            "curN": len(cur), "prevN": len(prev),
            "curPositive": cur_sent["positive"], "prevPositive": prev_sent["positive"],
            "curAvgRating": cur_sent["avgRating"], "prevAvgRating": prev_sent["avgRating"],
            "canCompare": can_compare, "delta": delta, "avgDelta": avg_delta,
        })
    out.sort(key=lambda x: (x["curAvgRating"] or 0), reverse=True)
    return out


def set_cache(conn, key: str, payload) -> None:
    new_json = json.dumps(payload, default=str)
    existing = conn.execute(
        "SELECT payload FROM analytics_cache WHERE cache_key = ?", (key,)
    ).fetchone()
    if existing and existing["payload"] == new_json:
        return
    conn.execute(
        """INSERT INTO analytics_cache (cache_key, computed_at, payload) VALUES (?, datetime('now'), ?)
           ON CONFLICT(cache_key) DO UPDATE SET computed_at = datetime('now'), payload = excluded.payload""",
        (key, new_json),
    )


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    conn = db.get_connection()
    db.init_schema(conn)

    rows = conn.execute(
        """SELECT r.*, l.name AS location_name, l.city AS city, l.brand AS brand
           FROM reviews r JOIN locations l ON l.id = r.location_id
           WHERE r.is_deleted = 0"""
    ).fetchall()
    reviews  = [dict(r) for r in rows]
    locations = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM locations").fetchall()}

    now   = datetime.now(timezone.utc)
    today = now.date().isoformat()
    d30   = (now - timedelta(days=30)).date().isoformat()
    d60   = (now - timedelta(days=60)).date().isoformat()
    d90   = (now - timedelta(days=90)).date().isoformat()

    period      = [r for r in reviews if r.get("review_date") and d30 <= r["review_date"] <= today]
    prev_period = [r for r in reviews if r.get("review_date") and d60 <= r["review_date"] < d30]
    recent_90   = [r for r in reviews if r.get("review_date") and r["review_date"] >= d90]

    # --- KPIs ---
    rated = [r for r in reviews if r.get("star_rating") is not None]
    rated_30 = [r for r in period if r.get("star_rating") is not None]
    avg_30   = round(sum(r["star_rating"] for r in rated_30) / len(rated_30), 2) if rated_30 else None

    prev_rated = [r for r in prev_period if r.get("star_rating") is not None]
    prev_avg_30 = round(sum(r["star_rating"] for r in prev_rated) / len(prev_rated), 2) if prev_rated else None
    rating_delta = round(avg_30 - prev_avg_30, 2) if avg_30 and prev_avg_30 else 0.0

    unanswered = sum(
        1 for r in reviews
        if (r.get("star_rating") or 5) <= 2 and not (r.get("owner_response") or "").strip()
    )
    company_health = compute_health_score(reviews, period)

    kpis = {
        "totalReviews":      len(reviews),
        "totalLocations":    len(locations),
        "lifetimeAvgRating": round(sum(r["star_rating"] for r in rated) / len(rated), 2) if rated else None,
        "period30dSentiment": sentiment(period),
        "avgRating30d":      avg_30,
        "ratingDelta30d":    rating_delta,
        "unansweredCount":   unanswered,
        "healthScore":       company_health,
        "computedAt":        now.isoformat(),
    }
    set_cache(conn, "kpis", kpis)

    # --- Standard caches ---
    set_cache(conn, "monthly_trend", monthly_trend(reviews))

    loc_stats = location_stats(reviews, period, locations)
    set_cache(conn, "location_stats", loc_stats)
    set_cache(conn, "rankings_30d", rankings(period, prev_period, locations))

    # --- Complaint intelligence ---
    intel = build_complaint_intelligence(reviews, period, prev_period)
    set_cache(conn, "complaint_intelligence", intel)

    # --- Location-level intelligence ---
    by_loc_all    = defaultdict(list)
    by_loc_30     = defaultdict(list)
    for r in reviews:
        by_loc_all[r["location_id"]].append(r)
    for r in period:
        by_loc_30[r["location_id"]].append(r)

    for loc_id, loc in locations.items():
        all_r    = by_loc_all[loc_id]
        period_r = by_loc_30[loc_id]
        recent_90_r = [r for r in all_r if r.get("review_date") and r["review_date"] >= d90]

        loc_intel = build_complaint_intelligence(all_r, period_r,
            [r for r in reviews if r["location_id"] == loc_id
             and r.get("review_date") and d60 <= r["review_date"] < d30])

        loc_staff  = find_staff_names(recent_90_r)
        loc_menu   = find_menu_items(recent_90_r)
        loc_trend  = monthly_trend(all_r)
        loc_health = compute_health_score(all_r, period_r)
        loc_pred   = predict_rating(all_r)
        loc_vol    = predict_volume(all_r)
        loc_alert  = rating_trend_alert(all_r, loc["name"])

        rated_loc_30 = [r for r in period_r if r.get("star_rating") is not None]
        loc_avg_30 = round(sum(r["star_rating"] for r in rated_loc_30) / len(rated_loc_30), 2) if rated_loc_30 else None
        prev_loc_rated = [r for r in reviews if r["location_id"] == loc_id
                          and r.get("review_date") and d60 <= r["review_date"] < d30
                          and r.get("star_rating") is not None]
        prev_loc_avg = round(sum(r["star_rating"] for r in prev_loc_rated) / len(prev_loc_rated), 2) if prev_loc_rated else None
        loc_delta = round(loc_avg_30 - prev_loc_avg, 2) if loc_avg_30 and prev_loc_avg else 0.0

        unanswered_neg = sum(
            1 for r in all_r
            if (r.get("star_rating") or 5) <= 2 and not (r.get("owner_response") or "").strip()
        )

        praised_staff = [s["name"] for s in loc_staff if s["sentiment"] == "positive"]

        top_complaint = loc_intel["complaints"][0]["name"] if loc_intel["complaints"] else None
        top_praise    = loc_intel["praises"][0]["name"] if loc_intel["praises"] else None

        loc_summary_data = {
            "location_name": loc["name"],
            "period_reviews": len(period_r),
            "avg_rating": loc_avg_30 or 0,
            "rating_delta": loc_delta,
            "positive_pct": sentiment(period_r)["positive"],
            "top_complaint": top_complaint,
            "top_praise": top_praise,
            "praised_staff": praised_staff,
            "unanswered_negative": unanswered_neg,
            "prediction_30d": loc_pred,
        }

        ai_summary = ai_engine.generate_location_summary(loc_summary_data) if ai_engine.is_available() else None

        slug = slugify(loc["name"])
        set_cache(conn, f"location_detail_{slug}", {
            "name": loc["name"], "city": loc["city"], "brand": loc["brand"],
            "healthScore": loc_health,
            "avgRating30d": loc_avg_30,
            "ratingDelta": loc_delta,
            "predictedRating": loc_pred,
            "predictedVolume": loc_vol,
            "trendAlert": loc_alert,
            "sentiment30d": sentiment(period_r),
            "monthlyTrend": loc_trend,
            "complaints": loc_intel["complaints"],
            "praises": loc_intel["praises"],
            "staffMentions": loc_staff,
            "menuHighlights": loc_menu,
            "aiSummary": ai_summary,
        })

    # --- Predictive alerts (company-wide) ---
    alerts = []
    for loc_id, loc in locations.items():
        alert = rating_trend_alert(by_loc_all[loc_id], loc["name"])
        if alert:
            alerts.append(alert)
    set_cache(conn, "predictive_alerts", alerts)

    # --- Company AI executive summary ---
    rated_all_locs = [
        s for s in loc_stats if s.get("periodSentiment", {}).get("avgRating") is not None
    ]
    if rated_all_locs:
        sorted_locs = sorted(rated_all_locs,
                             key=lambda s: s["periodSentiment"]["avgRating"] or 0)
        worst = sorted_locs[0]
        best  = sorted_locs[-1]
        top_complaint_name = intel["complaints"][0]["name"] if intel["complaints"] else "none identified"
        top_praise_name    = intel["praises"][0]["name"] if intel["praises"] else "none identified"
        sent30 = sentiment(period)

        ai_data = {
            "total_locations": len(locations),
            "period_reviews":  len(period),
            "avg_rating":      avg_30 or 0,
            "rating_delta":    rating_delta,
            "positive_pct":    sent30["positive"],
            "negative_pct":    sent30["bad"],
            "unanswered_count": unanswered,
            "best_location":   best["name"],
            "best_rating":     best["periodSentiment"]["avgRating"] or 0,
            "worst_location":  worst["name"],
            "worst_rating":    worst["periodSentiment"]["avgRating"] or 0,
            "top_complaint":   top_complaint_name,
            "top_praise":      top_praise_name,
            "locations_above_4": sum(
                1 for s in rated_all_locs
                if (s["periodSentiment"]["avgRating"] or 0) >= 4.0
            ),
        }

        ai_summary = ai_engine.generate_company_summary(ai_data) if ai_engine.is_available() else None
        set_cache(conn, "ai_company_summary", ai_summary or {"text": None})

    # --- Response drafts ---
    existing_draft_keys = {
        row["cache_key"]
        for row in conn.execute(
            "SELECT cache_key FROM analytics_cache WHERE cache_key LIKE 'draft_%'"
        ).fetchall()
    }
    loc_map = {loc_id: dict(loc) for loc_id, loc in locations.items()}
    new_drafts = ai_engine.batch_generate_drafts(reviews, loc_map, existing_draft_keys)
    for key, draft in new_drafts.items():
        set_cache(conn, key, draft)
    if new_drafts:
        print(f"[ai] Generated {len(new_drafts)} new response drafts")

    conn.commit()
    conn.close()
    print(f"Analytics refreshed: {len(reviews)} reviews, {len(locations)} locations | AI={'on' if ai_engine.is_available() else 'off'}")


if __name__ == "__main__":
    main()
