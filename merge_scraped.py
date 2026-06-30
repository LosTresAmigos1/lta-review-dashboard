"""
Merge scraped_reviews.csv into reviews.csv, then copy to dashboard/ and rebuild.

NOTE: This is a legacy one-off script from before auto_update.py existed.
dashboard/reviews.csv is now the live, continuously-updated source of truth
(kept current by auto_update.py / "Update Dashboard.bat"), so it normally has
MORE reviews than the root reviews.csv. This script refuses to overwrite
dashboard/reviews.csv if doing so would reduce its review count, to avoid
silently destroying newer scraped data.

Usage:  python merge_scraped.py
"""
import csv
import re
import shutil
import subprocess
from pathlib import Path

BASE     = Path(__file__).parent
MAIN_CSV = BASE / "reviews.csv"
SCRAPE   = BASE / "scraped_reviews.csv"
DASH_CSV = BASE / "dashboard" / "reviews.csv"

FIELDNAMES = ["location_name","city","reviewer_name","review_date",
              "star_rating","review_text","owner_response","review_url"]

PLACEID_RE = re.compile(r'placeid=([^&]+)')
MAPS_ID_RE = re.compile(r'/reviews/([^/?]+)')


def canonical_id(url: str):
    if not url:
        return None
    m = PLACEID_RE.search(url)
    if m:
        return m.group(1)
    m = MAPS_ID_RE.search(url)
    if m:
        return m.group(1)
    return None


def dedup_key(row: dict):
    rid = canonical_id(row.get("review_url", ""))
    if rid:
        return rid
    return (row["location_name"], row["reviewer_name"], row["review_date"], row["star_rating"])


def load_csv(path: Path) -> list[dict]:
    with path.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))

def main():
    if not SCRAPE.exists():
        print(f"ERROR: {SCRAPE} not found — run scrape_reviews.py first")
        return

    existing = load_csv(MAIN_CSV)
    scraped  = load_csv(SCRAPE)

    # Deduplicate by canonical review id (falls back to a content key for rows without a URL)
    seen = {dedup_key(r) for r in existing}

    added = 0
    for r in scraped:
        key = dedup_key(r)
        if key not in seen:
            existing.append(r)
            seen.add(key)
            added += 1

    # Write merged CSV
    with MAIN_CSV.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDNAMES, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(existing)

    print(f"[OK] Merged: {added} new reviews added  ({len(existing)} total)")

    # Safety check: dashboard/reviews.csv is the live source of truth kept
    # current by auto_update.py. Refuse to clobber it with a smaller/older dataset.
    if DASH_CSV.exists():
        current_dash_count = len(load_csv(DASH_CSV))
        if current_dash_count > len(existing):
            print(
                f"[ABORT] {DASH_CSV} currently has {current_dash_count} reviews, "
                f"which is more than the {len(existing)} this merge would produce. "
                f"Not overwriting — this would delete {current_dash_count - len(existing)} reviews. "
                f"Reconcile the two CSVs manually before re-running."
            )
            return

    # Copy to dashboard
    shutil.copy(MAIN_CSV, DASH_CSV)
    print(f"[OK] Copied to {DASH_CSV}")

    # Rebuild and redeploy
    print("\nBuilding dashboard...")
    result = subprocess.run("npm run build", cwd=BASE / "dashboard", shell=True)
    if result.returncode != 0:
        print("✗ Build failed")
        return

    print("\nDeploying to Vercel...")
    subprocess.run("vercel --prod --yes", cwd=BASE / "dashboard", shell=True)

if __name__ == "__main__":
    main()
