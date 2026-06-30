"""
refresh_analytics.py - Analytics + Sentiment Intelligence + Manager Insights
agent (Milestone 2).

Ports dashboard/src/utils/dataUtils.js and textAnalysis.js's aggregation
logic to run server-side against reviews.db, caching results in
analytics_cache so export_chunks.py (Milestone 3) can ship precomputed
JSON to the frontend instead of recomputing all of this in every browser
tab. No LLM: this is the same regex/word-frequency heuristic the frontend
already uses today, just running once per pipeline run instead of once per
page load.
"""
import json
import re
from collections import Counter
from datetime import datetime, timedelta, timezone

import db

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
    'back', 'out', 'over', 'well', 've', 'll', 're', 's', 't', 'm', 'd', 'didn', 'isn',
    'wasn', 'weren', 'wouldn', 'couldn', 'don', 'doesn', 'hasn', 'hadn', 'won',
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
    'menudo', 'pozole', 'birria', 'mole', 'churros', 'churro', 'sopas', 'sopa', 'chile relleno',
    'chile rellenos', 'flautas', 'flauta', 'taquitos', 'taquito', 'elote', 'horchata',
    'jarritos', 'tres leches', 'flan', 'street tacos', 'fish tacos', 'steak',
    'shrimp', 'chicken', 'pork', 'beef', 'queso', 'pico', 'cilantro', 'lime',
]

STAFF_PATTERNS = [
    re.compile(r'(?:our|my)\s+(?:server|waiter|waitress|bartender|host|manager|girl|guy)\s+([A-Z][a-z]+)'),
    re.compile(r'(?:server|waiter|waitress|bartender|host|manager)\s+(?:named?\s+)?([A-Z][a-z]+)'),
    re.compile(r'(?:ask for|ask for our|shoutout to|thanks? to|kudos to|great job)\s+([A-Z][a-z]+)'),
    re.compile(r'([A-Z][a-z]+)\s+(?:was our|is our|helped us|was amazing|was great|was wonderful|was fantastic|was awesome)'),
]

NAME_DENYLIST = {
    'english', 'spanish', 'mexican', 'american', 'great', 'good', 'amazing', 'awesome',
    'wonderful', 'fantastic', 'excellent', 'perfect', 'friendly', 'attentive', 'quick',
    'fast', 'slow', 'rude', 'nice', 'super', 'very', 'extremely', 'always', 'definitely',
    'absolutely', 'overall', 'honestly', 'seriously', 'today', 'yesterday', 'monday',
    'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january',
    'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
    'october', 'november', 'december', 'manager', 'server', 'waiter', 'waitress',
    'bartender', 'host', 'hostess',
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


def top_themes(reviews: list, top_n: int = 8) -> list:
    texts = [r["review_text"] for r in reviews if r["review_text"]]
    freq = word_freq(texts, limit=top_n)
    out = []
    for item in freq:
        word = item["word"]
        examples = [r for r in reviews if r["review_text"] and word in r["review_text"].lower()][:3]
        out.append({
            "theme": word, "count": item["count"],
            "reviews": [{"reviewer_name": r["reviewer_name"], "review_text": r["review_text"],
                         "review_date": r["review_date"]} for r in examples],
        })
    return out


def find_menu_items(reviews: list, top_n: int = 8) -> list:
    found = {}
    for r in reviews:
        text = (r["review_text"] or "").lower()
        if not text:
            continue
        for item in MENU_ITEMS:
            if item in text:
                slot = found.setdefault(item, {"item": item, "count": 0, "reviews": []})
                slot["count"] += 1
                if len(slot["reviews"]) < 3:
                    slot["reviews"].append({"reviewer_name": r["reviewer_name"], "review_text": r["review_text"]})
    return sorted(found.values(), key=lambda x: -x["count"])[:top_n]


def find_staff_names(reviews: list, top_n: int = 10) -> list:
    counts = Counter()
    by_name = {}
    for r in reviews:
        text = r["review_text"]
        if not text:
            continue
        for pattern in STAFF_PATTERNS:
            for m in pattern.finditer(text):
                name = m.group(1)
                if not name or len(name) < 2 or name.lower() in NAME_DENYLIST:
                    continue
                counts[name] += 1
                by_name.setdefault(name, [])
                if len(by_name[name]) < 3:
                    by_name[name].append({"reviewer_name": r["reviewer_name"], "review_text": r["review_text"]})
    return [
        {"name": name, "count": c, "reviews": by_name[name]}
        for name, c in counts.most_common() if c >= 2
    ][:top_n]


def extract_insights(reviews: list) -> dict:
    positive = [r for r in reviews if (r["star_rating"] or 0) >= 4]
    negative = [r for r in reviews if (r["star_rating"] or 0) and r["star_rating"] <= 2]
    return {
        "positiveThemes": top_themes(positive),
        "complaints": top_themes(negative),
        "staffNames": find_staff_names(reviews),
        "menuItems": find_menu_items(reviews),
    }


def sentiment(reviews: list) -> dict:
    n = len(reviews)
    if n == 0:
        return {"n": 0, "positiveN": 0, "neutralN": 0, "badN": 0, "positive": 0, "neutral": 0, "bad": 0}
    positive_n = sum(1 for r in reviews if (r["star_rating"] or 0) >= 4)
    neutral_n = sum(1 for r in reviews if r["star_rating"] == 3)
    bad_n = sum(1 for r in reviews if (r["star_rating"] or 0) and r["star_rating"] <= 2)
    return {
        "n": n, "positiveN": positive_n, "neutralN": neutral_n, "badN": bad_n,
        "positive": positive_n / n * 100, "neutral": neutral_n / n * 100, "bad": bad_n / n * 100,
    }


def confidence(n: int) -> dict:
    if n == 0:
        return {"level": 0, "label": "Insufficient data"}
    if n < 5:
        return {"level": 1, "label": "Low confidence"}
    if n < 10:
        return {"level": 2, "label": "Moderate"}
    return {"level": 3, "label": "Good"}


def monthly_trend(reviews: list) -> list:
    buckets = {}
    for r in reviews:
        if not r["review_date"] or r["star_rating"] is None:
            continue
        ym = r["review_date"][:7]
        b = buckets.setdefault(ym, {"sum": 0, "count": 0})
        b["sum"] += r["star_rating"]
        b["count"] += 1
    return [
        {"ym": ym, "count": b["count"], "avg": round(b["sum"] / b["count"], 2) if b["count"] else None}
        for ym, b in sorted(buckets.items())
    ]


def location_stats(all_reviews: list, period_reviews: list, locations: dict) -> list:
    by_loc_all, by_loc_period = {}, {}
    for r in all_reviews:
        by_loc_all.setdefault(r["location_id"], []).append(r)
    for r in period_reviews:
        by_loc_period.setdefault(r["location_id"], []).append(r)

    out = []
    for loc_id, loc in locations.items():
        all_r = by_loc_all.get(loc_id, [])
        period_r = by_loc_period.get(loc_id, [])
        rated = [r for r in all_r if r["star_rating"] is not None]
        lifetime_rating = round(sum(r["star_rating"] for r in rated) / len(rated), 2) if rated else None
        star_breakdown = [{"star": s, "count": sum(1 for r in period_r if r["star_rating"] == s)} for s in range(1, 6)]
        out.append({
            "name": loc["name"], "city": loc["city"], "brand": loc["brand"],
            "lifetimeRating": lifetime_rating, "lifetimeCount": len(all_r),
            "periodSentiment": sentiment(period_r), "starBreakdown": star_breakdown,
            "confidence": confidence(len(period_r)),
            "isUnverified": (not loc["brand"] or loc["brand"] == "Other"
                             or not loc["city"] or loc["city"] == "Unknown"),
            "spark": monthly_trend(all_r)[-6:],
        })
    return out


def rankings(period_reviews: list, prev_reviews: list, locations: dict) -> list:
    by_loc_period, by_loc_prev = {}, {}
    for r in period_reviews:
        by_loc_period.setdefault(r["location_id"], []).append(r)
    for r in prev_reviews:
        by_loc_prev.setdefault(r["location_id"], []).append(r)

    out = []
    for loc_id in set(by_loc_period) | set(by_loc_prev):
        loc = locations.get(loc_id)
        if not loc:
            continue
        cur, prev = by_loc_period.get(loc_id, []), by_loc_prev.get(loc_id, [])
        cur_sent, prev_sent = sentiment(cur), sentiment(prev)
        cur_conf, prev_conf = confidence(len(cur)), confidence(len(prev))
        can_compare = cur_conf["level"] >= 3 and prev_conf["level"] >= 3
        delta = round(cur_sent["positive"] - prev_sent["positive"], 1) if can_compare else None
        out.append({
            "name": loc["name"], "brand": loc["brand"],
            "curN": len(cur), "prevN": len(prev),
            "curPositive": cur_sent["positive"], "prevPositive": prev_sent["positive"],
            "canCompare": can_compare, "delta": delta,
        })
    out.sort(key=lambda x: x["curPositive"], reverse=True)
    return out


def set_cache(conn, key: str, payload) -> None:
    new_json = json.dumps(payload)
    existing = conn.execute("SELECT payload FROM analytics_cache WHERE cache_key = ?", (key,)).fetchone()
    if existing and existing["payload"] == new_json:
        return  # unchanged -- skip rewriting computed_at so boring runs don't bloat the SQLite diff
    conn.execute(
        """INSERT INTO analytics_cache (cache_key, computed_at, payload) VALUES (?, datetime('now'), ?)
           ON CONFLICT(cache_key) DO UPDATE SET computed_at = datetime('now'), payload = excluded.payload""",
        (key, new_json),
    )


def main():
    conn = db.get_connection()
    db.init_schema(conn)

    rows = conn.execute(
        """SELECT r.*, l.name AS location_name, l.city AS city, l.brand AS brand
           FROM reviews r JOIN locations l ON l.id = r.location_id
           WHERE r.is_deleted = 0"""
    ).fetchall()
    reviews = [dict(r) for r in rows]
    locations = {row["id"]: dict(row) for row in conn.execute("SELECT * FROM locations").fetchall()}

    today = datetime.now(timezone.utc).date().isoformat()
    d30 = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    d60 = (datetime.now(timezone.utc) - timedelta(days=60)).date().isoformat()
    d90 = (datetime.now(timezone.utc) - timedelta(days=90)).date().isoformat()

    period = [r for r in reviews if r["review_date"] and d30 <= r["review_date"] <= today]
    prev_period = [r for r in reviews if r["review_date"] and d60 <= r["review_date"] < d30]
    recent_90 = [r for r in reviews if r["review_date"] and r["review_date"] >= d90]

    rated = [r for r in reviews if r["star_rating"] is not None]
    kpis = {
        "totalReviews": len(reviews),
        "totalLocations": len(locations),
        "lifetimeAvgRating": round(sum(r["star_rating"] for r in rated) / len(rated), 2) if rated else None,
        "period30dSentiment": sentiment(period),
        "computedAt": datetime.now(timezone.utc).isoformat(),
    }

    set_cache(conn, "kpis", kpis)
    set_cache(conn, "monthly_trend", monthly_trend(reviews))
    set_cache(conn, "location_stats", location_stats(reviews, period, locations))
    set_cache(conn, "rankings_30d", rankings(period, prev_period, locations))
    set_cache(conn, "insights_90d_all", extract_insights(recent_90))

    for loc_id, loc in locations.items():
        loc_recent_90 = [r for r in recent_90 if r["location_id"] == loc_id]
        set_cache(conn, f"insights_90d_{slugify(loc['name'])}", extract_insights(loc_recent_90))

    conn.commit()
    conn.close()
    print(f"Analytics refreshed: {len(reviews)} reviews, {len(locations)} locations cached")


if __name__ == "__main__":
    main()
