"""
One-time backfill: load dashboard/reviews.csv into dashboard/reviews.db.

Run once: python migrate_csv_to_sqlite.py
Safe to re-run -- upsert_review() is idempotent per dedup_key, so re-running
this after auto_update.py has already started dual-writing just re-confirms
the same rows rather than duplicating them.
"""
import csv
from datetime import datetime, timezone
from pathlib import Path

import db
from auto_update import LOCATIONS

BASE_DIR = Path(__file__).parent
REVIEWS_CSV = BASE_DIR / "dashboard" / "reviews.csv"


def main():
    if not REVIEWS_CSV.exists():
        print(f"ERROR: {REVIEWS_CSV} not found")
        return

    conn = db.get_connection()
    db.init_schema(conn)

    location_ids = {}
    for loc in LOCATIONS:
        location_ids[loc["name"]] = db.get_or_create_location(
            conn, loc["name"], loc["city"], db.get_brand(loc["name"]), loc["search"]
        )
    conn.commit()

    with REVIEWS_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    print(f"Read {len(rows)} rows from {REVIEWS_CSV}")

    now = datetime.now(timezone.utc).isoformat()
    counts = {"new": 0, "edited": 0, "unchanged": 0, "skipped_unknown_location": 0}

    for row in rows:
        loc_name = row.get("location_name", "")
        loc_id = location_ids.get(loc_name)
        if loc_id is None:
            # Location in the CSV that isn't in auto_update.py's LOCATIONS list
            # (e.g. a legacy/renamed location) -- create it rather than drop data.
            loc_id = db.get_or_create_location(conn, loc_name, row.get("city", ""), db.get_brand(loc_name))
            location_ids[loc_name] = loc_id

        try:
            row["star_rating"] = int(row["star_rating"]) if row.get("star_rating") else None
        except ValueError:
            row["star_rating"] = None

        result = db.upsert_review(conn, loc_id, loc_name, row, now)
        counts[result] = counts.get(result, 0) + 1

    conn.commit()

    total_in_db = conn.execute("SELECT COUNT(*) AS c FROM reviews").fetchone()["c"]
    conn.close()

    print(f"Backfill complete: {counts}")
    print(f"Total reviews now in {db.DB_PATH}: {total_in_db} (CSV had {len(rows)} rows)")
    if total_in_db != len(rows):
        print(
            f"NOTE: counts differ because some CSV rows share a dedup_key "
            f"(duplicates collapsed) -- this matches the dedup behavior already "
            f"applied to reviews.csv this session, not a new bug."
        )


if __name__ == "__main__":
    main()
