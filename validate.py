"""
validate.py - Data Validation Agent (Milestone 2).

Ports dashboard/src/pages/DataValidation.jsx's buildReport() checks to run
server-side against reviews.db, writing results into validation_flags so
issues persist across runs instead of being recomputed from scratch by
every browser tab. Re-run idempotently: each run resolves the flags it's
about to recompute, then re-inserts whatever is still wrong, so
validation_flags reflects "currently broken" plus a resolved-at history of
when each issue cleared.
"""
from datetime import datetime, timezone

import db

CHECK_TYPES = [
    "duplicate_review_url", "missing_text", "missing_url", "missing_reviewer",
    "bad_star_rating", "stale_location", "unverified_location",
]


def days_between(a: str, b: str) -> int:
    return (datetime.fromisoformat(b) - datetime.fromisoformat(a)).days


def resolve_stale_flags(conn, now: str):
    placeholders = ",".join("?" * len(CHECK_TYPES))
    conn.execute(
        f"UPDATE validation_flags SET resolved_at = ? "
        f"WHERE resolved_at IS NULL AND flag_type IN ({placeholders})",
        (now, *CHECK_TYPES),
    )


def insert_flag(conn, review_id, location_id, flag_type, detail, now):
    conn.execute(
        """INSERT INTO validation_flags (review_id, location_id, flag_type, detail, detected_at)
           VALUES (?, ?, ?, ?, ?)""",
        (review_id, location_id, flag_type, detail, now),
    )


def run(conn) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    resolve_stale_flags(conn, now)

    reviews = conn.execute(
        "SELECT id, location_id, review_url, review_text, reviewer_name, star_rating, review_date "
        "FROM reviews WHERE is_deleted = 0"
    ).fetchall()
    locations = {row["id"]: row for row in conn.execute("SELECT id, name, city, brand FROM locations").fetchall()}

    counts = {k: 0 for k in CHECK_TYPES}

    # Structurally this should never fire -- dedup_key is UNIQUE, and
    # review_url-derived rows collapse to the same dedup_key. Kept as a
    # safety net in case dedup_key()'s fallback (location/reviewer/date/star)
    # ever lets two distinct URLs through that shouldn't have been distinct.
    by_url = {}
    for r in reviews:
        if r["review_url"]:
            by_url.setdefault(r["review_url"], []).append(r)
    for url, group in by_url.items():
        if len(group) > 1:
            for r in group:
                insert_flag(conn, r["id"], r["location_id"], "duplicate_review_url",
                            f"{len(group)} rows share review_url {url}", now)
            counts["duplicate_review_url"] += len(group) - 1

    max_date = max((r["review_date"] or "" for r in reviews), default="")
    per_location_last = {}

    for r in reviews:
        if not r["review_text"]:
            insert_flag(conn, r["id"], r["location_id"], "missing_text", None, now)
            counts["missing_text"] += 1
        if not r["review_url"]:
            insert_flag(conn, r["id"], r["location_id"], "missing_url", None, now)
            counts["missing_url"] += 1
        if not r["reviewer_name"]:
            insert_flag(conn, r["id"], r["location_id"], "missing_reviewer", None, now)
            counts["missing_reviewer"] += 1
        if not (r["star_rating"] and 1 <= r["star_rating"] <= 5):
            insert_flag(conn, r["id"], r["location_id"], "bad_star_rating",
                        f"star_rating={r['star_rating']}", now)
            counts["bad_star_rating"] += 1
        if r["review_date"] and r["review_date"] > per_location_last.get(r["location_id"], ""):
            per_location_last[r["location_id"]] = r["review_date"]

    for loc_id, loc in locations.items():
        last_date = per_location_last.get(loc_id, "")
        if last_date and max_date:
            stale_days = days_between(last_date, max_date)
            if stale_days > 60:
                insert_flag(conn, None, loc_id, "stale_location",
                            f"No new review in {stale_days} days (last: {last_date})", now)
                counts["stale_location"] += 1
        brand_known = bool(loc["brand"]) and loc["brand"] != "Other"
        city_known = bool(loc["city"]) and loc["city"] != "Unknown"
        if not brand_known or not city_known:
            insert_flag(conn, None, loc_id, "unverified_location",
                        f"brand={loc['brand']!r} city={loc['city']!r}", now)
            counts["unverified_location"] += 1

    conn.commit()
    return counts


def main():
    conn = db.get_connection()
    db.init_schema(conn)
    counts = run(conn)
    conn.close()
    print(f"Validation complete: {counts}")
    return counts


if __name__ == "__main__":
    main()
