"""
Headless scraper for all 21 LTA restaurants.
Run by GitHub Actions every 4 hours.
Writes new reviews to dashboard/reviews.db (source of truth) and
dashboard/reviews.csv (secondary export), and outputs GitHub Actions variables.
"""
import os
import sys
import csv
import re
import asyncio
from datetime import datetime, timedelta, timezone
from pathlib import Path
from collections import defaultdict

import db

BASE_DIR = Path(__file__).parent
REVIEWS_CSV = BASE_DIR / "dashboard" / "reviews.csv"
GITHUB_OUTPUT = os.environ.get("GITHUB_OUTPUT", "")

LOCAL_MODE = "--local" in sys.argv  # headed browser, more reviews, git push + vercel deploy
MAX_SCROLL = 3000 if LOCAL_MODE else 300   # max reviews to load per location (3000 covers all locations)
EXTRACT_EVERY = 50                         # extract from DOM every N new reviews to avoid Chrome GC crash

LOCATIONS = [
    {"name": "Los Tres Amigos Livonia",         "city": "Livonia",         "search": "Los Tres Amigos 29441 Five Mile Rd Livonia MI"},
    {"name": "Los Tres Amigos Chelsea",          "city": "Chelsea",         "search": "Los Tres Amigos 350 N Main St Chelsea MI"},
    {"name": "Los Tres Amigos Owosso",           "city": "Owosso",          "search": "Los Tres Amigos 1631 East Main St Owosso MI"},
    {"name": "Los Tres Amigos Mason",            "city": "Mason",           "search": "Los Tres Amigos 447 S Jefferson St Mason MI"},
    {"name": "Los Tres Amigos Jackson",          "city": "Jackson",         "search": "Los Tres Amigos 1111 North West Avenue Jackson MI"},
    {"name": "Mi Lindo San Blas Detroit",        "city": "Detroit",         "search": "Mi Lindo San Blas 1807 Livernois Avenue Detroit MI"},
    {"name": "Los Tres Mex Grill East Lansing",  "city": "East Lansing",    "search": "Los Tres Mex Grill 115 Albert St East Lansing MI"},
    {"name": "Los Tres Amigos Lansing",          "city": "Lansing",         "search": "Los Tres Amigos Lansing MI"},
    {"name": "Los Tres Amigos Canton",           "city": "Canton",          "search": "Los Tres Amigos 6600 N Canton Center Rd Canton MI"},
    {"name": "Los Tres Amigos Farmington",       "city": "Farmington",      "search": "Los Tres Amigos Farmington MI"},
    {"name": "Los Tres Amigos Holt",             "city": "Holt",            "search": "Los Tres Amigos 2457 Cedar St Holt MI"},
    {"name": "Los Tres Mex Grill Jackson",       "city": "Jackson",         "search": "Los Tres Mex Grill 3236 Michigan Ave Jackson MI"},
    {"name": "Los Tres Amigos Howell",           "city": "Howell",          "search": "Los Tres Amigos Howell MI"},
    {"name": "Los Tres Amigos Plymouth",         "city": "Plymouth",        "search": "Los Tres Amigos 39500 Ann Arbor Road Plymouth MI"},
    {"name": "Rio Luna Tacos & Tequila",         "city": "Saginaw",         "search": "Rio Luna Tacos Tequila Saginaw MI"},
    {"name": "Mi Lindo San Blas Lincoln Park",   "city": "Lincoln Park",    "search": "Mi Lindo San Blas 3456 Fort Street Lincoln Park MI"},
    {"name": "Los Tres Amigos West Jackson",     "city": "Jackson",         "search": "Los Tres Amigos 1923 West Michigan Avenue Jackson MI"},
    {"name": "Los Tres Amigos Northville",       "city": "Northville",      "search": "Los Tres Amigos 144 Mary Alexander Ct Northville MI"},
    {"name": "Los Tres Amigos Michigan Center",  "city": "Michigan Center", "search": "Los Tres Amigos 328 5th St Michigan Center MI"},
    {"name": "Casa Tequila Brighton",            "city": "Brighton",        "search": "Casa Tequila 501 W Main St Brighton MI"},
    {"name": "Casa Tequila Chicago",             "city": "Chicago",         "search": "Casa Tequila 1949 W Division St Chicago IL"},
]

FIELDNAMES = ["location_name", "city", "reviewer_name", "review_date",
              "star_rating", "review_text", "owner_response", "review_url"]

# The same underlying Google review shows up under different review_url formats
# depending on which pipeline scraped it: Takeout/API exports use
# "?placeid=<id>", this Playwright scraper uses "/reviews/<id>". Comparing the
# raw URL string causes the same review to be treated as two different rows
# (a confirmed source of duplicate rows in dashboard/reviews.csv). Extracting
# just the ID lets every pipeline dedupe against every other pipeline.
_PLACEID_RE = re.compile(r'placeid=([^&]+)')
_MAPS_ID_RE = re.compile(r'/reviews/([^/?]+)')


def canonical_review_id(url: str):
    if not url:
        return None
    m = _PLACEID_RE.search(url)
    if m:
        return m.group(1)
    m = _MAPS_ID_RE.search(url)
    if m:
        return m.group(1)
    return None


def dedup_key(row: dict):
    rid = canonical_review_id(row.get("review_url", ""))
    if rid:
        return rid
    return (row["location_name"], row["reviewer_name"], row["review_date"], row["star_rating"])


def relative_to_date(text: str) -> str:
    now = datetime.now()
    t = text.lower().strip()
    if not t or "just now" in t or "moment" in t:
        return now.strftime("%Y-%m-%d")
    m = re.search(r'(\d+)\s*(second|minute|hour)', t)
    if m:
        return now.strftime("%Y-%m-%d")
    m = re.search(r'(\d+)\s*day', t)
    if m:
        return (now - timedelta(days=int(m.group(1)))).strftime("%Y-%m-%d")
    m = re.search(r'a\s*week|1\s*week', t)
    if m:
        return (now - timedelta(weeks=1)).strftime("%Y-%m-%d")
    m = re.search(r'(\d+)\s*week', t)
    if m:
        return (now - timedelta(weeks=int(m.group(1)))).strftime("%Y-%m-%d")
    m = re.search(r'a\s*month|1\s*month', t)
    if m:
        return (now - timedelta(days=30)).strftime("%Y-%m-%d")
    m = re.search(r'(\d+)\s*month', t)
    if m:
        return (now - timedelta(days=int(m.group(1)) * 30)).strftime("%Y-%m-%d")
    m = re.search(r'a\s*year|1\s*year', t)
    if m:
        return (now - timedelta(days=365)).strftime("%Y-%m-%d")
    m = re.search(r'(\d+)\s*year', t)
    if m:
        return (now - timedelta(days=int(m.group(1)) * 365)).strftime("%Y-%m-%d")
    return now.strftime("%Y-%m-%d")


async def dismiss_dialogs(page):
    for sel in ['button[aria-label="Accept all"]', 'button[aria-label="Reject all"]',
                'form[action*="consent"] button']:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=1000):
                await btn.click()
                await page.wait_for_timeout(500)
        except Exception:
            pass


async def extract_from_dom(page, seen_ids: set) -> list:
    """Extract reviews currently in the DOM, skipping any already in seen_ids."""
    new_reviews = []
    els = await page.query_selector_all('[data-review-id]')

    # Expand "See more" buttons for full text before reading
    for sel in ['button[aria-label*="See more"]', 'button.w8nwRe']:
        try:
            btns = await page.query_selector_all(sel)
            for btn in btns:
                try:
                    await btn.click()
                    await page.wait_for_timeout(50)
                except Exception:
                    pass
        except Exception:
            pass

    for el in els:
        try:
            rid = await el.get_attribute("data-review-id") or ""
            if not rid or rid in seen_ids:
                continue
            seen_ids.add(rid)

            name = ""
            for sel in ['.d4r55', '.DHIhE']:
                ne = await el.query_selector(sel)
                if ne:
                    name = (await ne.inner_text()).strip()
                    if name:
                        break

            stars = 0
            for sel in ['[aria-label*="star"]', '.kvMYJc', 'span[role="img"]']:
                se = await el.query_selector(sel)
                if se:
                    aria = (await se.get_attribute("aria-label")) or ""
                    m = re.search(r'(\d)', aria)
                    if m:
                        stars = int(m.group(1))
                        break

            date_str = ""
            for sel in ['.rsqaWe', 'span[class*="date"]']:
                de = await el.query_selector(sel)
                if de:
                    date_str = (await de.inner_text()).strip()
                    if date_str:
                        break

            text = ""
            for sel in ['.MyEned span[jslog]', '.MyEned span:not([jslog])', '.wiI7pd span']:
                te = await el.query_selector(sel)
                if te:
                    text = (await te.inner_text()).strip()
                    if text:
                        break

            owner_resp = ""
            # Strategy 1: JavaScript evaluation — most resilient to CSS class churn.
            # Finds the owner-response container by class OR by label text, strips
            # the "Response from the owner" header, and returns the reply body.
            try:
                owner_resp = (await el.evaluate("""el => {
                    const HEADER = 'response from the owner';
                    const candidates = [
                        el.querySelector('.CDe7pd'),
                        el.querySelector('.mTHi3d'),
                        el.querySelector('[data-reply-id]'),
                    ].filter(Boolean);
                    if (candidates.length === 0) {
                        for (const node of el.querySelectorAll('*')) {
                            const t = (node.innerText || '').trim().toLowerCase();
                            if (t === HEADER && node.parentElement) {
                                candidates.push(node.parentElement);
                                break;
                            }
                        }
                    }
                    for (const section of candidates) {
                        const full = (section.innerText || '').trim();
                        const cleaned = full
                            .replace(/^response from the owner[\\s\\n]*/i, '')
                            .replace(/\\s*See (more|less)\\s*$/i, '')
                            .trim();
                        if (cleaned && cleaned.toLowerCase() !== HEADER) return cleaned;
                    }
                    return '';
                }""")) or ""
            except Exception:
                pass

            # Strategy 2: CSS selector fallback
            if not owner_resp:
                for sel in [
                    '.CDe7pd .MyEned span[jslog]',
                    '.CDe7pd .MyEned span',
                    '.CDe7pd span',
                    '.mTHi3d span',
                    '[data-reply-id] span',
                ]:
                    re_el = await el.query_selector(sel)
                    if re_el:
                        candidate = (await re_el.inner_text()).strip()
                        if candidate and candidate.lower() != "response from the owner":
                            owner_resp = candidate
                            break

            if name or text:
                new_reviews.append({
                    "reviewer_name":  name,
                    "star_rating":    stars,
                    "review_date":    relative_to_date(date_str),
                    "review_text":    text,
                    "owner_response": owner_resp,
                    "review_url":     f"https://www.google.com/maps/reviews/{rid}" if rid else "",
                })
        except Exception:
            pass
    return new_reviews


async def scroll_and_extract(page, max_reviews: int) -> list:
    """Scroll the reviews feed and extract in batches to avoid Chrome GC crashes."""
    feed = None
    for sel in ['div[role="feed"]', '.m6QErb[role="feed"]', '.DxyBCb']:
        try:
            el = await page.query_selector(sel)
            if el:
                feed = el
                break
        except Exception:
            pass

    all_reviews = []
    seen_ids: set = set()
    prev_dom_count = 0
    stall = 0

    for _ in range(600):
        if feed:
            await feed.evaluate("el => el.scrollTop = el.scrollHeight")
        else:
            await page.keyboard.press("End")
        await page.wait_for_timeout(1100)

        dom_count = len(await page.query_selector_all('[data-review-id]'))
        new_in_dom = dom_count - len(seen_ids)

        # Extract in batches to free Chrome from holding too many live element refs
        if new_in_dom >= EXTRACT_EVERY or dom_count >= max_reviews:
            batch = await extract_from_dom(page, seen_ids)
            all_reviews.extend(batch)

        if dom_count >= max_reviews:
            break
        if dom_count == prev_dom_count:
            stall += 1
            if stall >= 5:
                break
        else:
            stall = 0
        prev_dom_count = dom_count

    # Final extract pass for any remaining unseen reviews
    final = await extract_from_dom(page, seen_ids)
    all_reviews.extend(final)
    return all_reviews


async def go_to_reviews_tab(page):
    """Click the Reviews tab. Returns True on success, False if not found."""

    # Strategy 1: direct aria-label selectors (most reliable across Maps layouts)
    for sel in [
        'button[aria-label^="Reviews"]',
        'button[aria-label*=" reviews"]',
        'button[aria-label*="Reviews,"]',
        '[role="tab"][aria-label*="Review"]',
        '[role="tab"]:has-text("Reviews")',
        'button:has-text("Reviews")',
        '.hh2c6:has-text("Reviews")',
    ]:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=2500):
                await btn.click()
                await page.wait_for_timeout(2500)
                # Verify review content appeared
                if await page.query_selector('[data-review-id]') or \
                   await page.query_selector('div[role="feed"]'):
                    return True
                return True  # tab clicked even if no reviews yet
        except Exception:
            pass

    # Strategy 2: iterate all tab/button elements looking for "review" text
    for tab_sel in ['[role="tab"]', 'button[data-tab-index]', '.hh2c6', '.RWPxGd button']:
        try:
            tabs = await page.query_selector_all(tab_sel)
            for tab in tabs:
                try:
                    txt = (await tab.inner_text()).lower().strip()
                    if "review" in txt:
                        await tab.click()
                        await page.wait_for_timeout(2500)
                        return True
                except Exception:
                    pass
        except Exception:
            pass

    # Strategy 3: look for a "Reviews" link in the place panel
    for link_sel in [
        'a[href*="#lrd"]', 'a[aria-label*="Review"]',
        'a[data-item-id*="review"]',
    ]:
        try:
            link = page.locator(link_sel).first
            if await link.is_visible(timeout=1000):
                await link.click()
                await page.wait_for_timeout(2500)
                if await page.query_selector('[data-review-id]'):
                    return True
        except Exception:
            pass

    return False


async def sort_by_newest(page):
    for sel in ['button[aria-label*="Sort reviews"]', 'button[aria-label*="sort" i]',
                '.fxNQSd button']:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=2000):
                await btn.click()
                await page.wait_for_timeout(800)
                for nsel in ['[data-index="1"]', 'li:nth-child(2)',
                             '[aria-label*="Newest"]', 'li:has-text("Newest")']:
                    try:
                        newest = page.locator(nsel).first
                        if await newest.is_visible(timeout=1000):
                            await newest.click()
                            await page.wait_for_timeout(1500)
                            return
                    except Exception:
                        pass
                break
        except Exception:
            pass


async def scroll_reviews(page, max_reviews=200):
    feed = None
    for sel in ['div[role="feed"]', '.m6QErb[role="feed"]', '.DxyBCb']:
        try:
            el = await page.query_selector(sel)
            if el:
                feed = el
                break
        except Exception:
            pass

    prev = 0
    stall = 0
    for _ in range(300):
        if feed:
            await feed.evaluate("el => el.scrollTop = el.scrollHeight")
        else:
            await page.keyboard.press("End")
        await page.wait_for_timeout(1200)
        count = len(await page.query_selector_all('[data-review-id]'))
        if count >= max_reviews:
            break
        if count == prev:
            stall += 1
            if stall >= 4:
                break
        else:
            stall = 0
        prev = count
    return count


async def scrape_location(context, loc) -> tuple:
    """Returns (reviews, error_message, maps_url).
    error_message is None on success so callers can tell "found nothing" apart
    from "the scrape itself failed". maps_url is the Google Maps place URL
    captured after navigating to the reviews tab (empty string if unavailable)."""
    name = loc["name"]
    search = loc["search"]
    print(f"  Scraping: {name}")

    page = await context.new_page()
    await page.set_extra_http_headers({"Accept-Language": "en-US,en;q=0.9"})
    try:
        url = "https://www.google.com/maps/search/" + search.replace(" ", "+")
        await page.goto(url, wait_until="domcontentloaded", timeout=30000)
        await page.wait_for_timeout(3000)
        await dismiss_dialogs(page)

        # Click the first place result (multiple selector fallbacks for Maps layout changes)
        for sel in ['.Nv2PK', '.hfpxzc', 'a[href*="/maps/place/"]', '.Io6YTe', '[data-value="Search Results"] .Nv2PK']:
            try:
                first = page.locator(sel).first
                if await first.is_visible(timeout=2000):
                    await first.click()
                    await page.wait_for_timeout(3500)  # extra time for panel to fully load
                    break
            except Exception:
                pass

        # Give the business panel extra time to render tabs
        await page.wait_for_timeout(1500)

        if not await go_to_reviews_tab(page):
            # One more wait + retry before giving up
            await page.wait_for_timeout(3000)
            if not await go_to_reviews_tab(page):
                # Collect diagnostic info for a useful error message
                try:
                    visible_tabs = []
                    for el in await page.query_selector_all('[role="tab"], button[data-tab-index]'):
                        try:
                            txt = (await el.inner_text()).strip()
                            if txt:
                                visible_tabs.append(txt)
                        except Exception:
                            pass
                    tabs_found = ", ".join(visible_tabs[:6]) or "none"
                except Exception:
                    tabs_found = "unknown"
                msg = f"Reviews tab not found (tabs visible: {tabs_found})"
                print(f"    [SKIP] {msg}")
                return [], msg, ""

        # Capture the Maps place URL now that we're on the reviews tab —
        # stored per-location so the dashboard can link directly to the business.
        maps_url = page.url or ""
        if maps_url.startswith("https://www.google.com/maps/search/"):
            maps_url = ""  # still on search page, not the place panel

        await sort_by_newest(page)
        reviews = await scroll_and_extract(page, MAX_SCROLL)
        with_resp = sum(1 for r in reviews if r.get("owner_response"))
        print(f"    -> {len(reviews)} reviews scraped, {with_resp} with owner response")
        return reviews, None, maps_url
    except Exception as e:
        print(f"    [ERR] {e}")
        return [], str(e), ""
    finally:
        await page.close()


def load_existing() -> set:
    """Return a set of canonical review-id keys (or location/reviewer/date/star fallback) for rows already saved."""
    if not REVIEWS_CSV.exists():
        return set()
    keys = set()
    with REVIEWS_CSV.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            keys.add(dedup_key(r))
    return keys


def is_duplicate(row: dict, existing_keys: set) -> bool:
    return dedup_key(row) in existing_keys


def append_to_csv(new_rows: list):
    with REVIEWS_CSV.open(encoding="utf-8") as f:
        existing = list(csv.DictReader(f))
    # Deduplicate the combined set by canonical review id before writing.
    # Prefer the more complete row when the same review appears twice
    # (e.g. one copy has a real owner reply, the other has none/placeholder).
    def score(r):
        return (2 if r.get("owner_response") else 0) + (1 if r.get("review_text") else 0)

    best = {}
    for r in existing + new_rows:
        key = dedup_key(r)
        if key not in best or score(r) > score(best[key]):
            best[key] = r
    with REVIEWS_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(best.values())


def build_email_html(new_rows: list) -> str:
    by_loc = defaultdict(list)
    for r in new_rows:
        by_loc[r["location_name"]].append(r)

    stars_html = lambda n: ("&#9733;" * n) + ("&#9734;" * (5 - n))

    sections = []
    for loc_name, reviews in sorted(by_loc.items()):
        items = ""
        for r in reviews[:10]:
            stars = int(r["star_rating"]) if r["star_rating"] else 0
            snippet = (r["review_text"] or "")[:200]
            if len(r["review_text"] or "") > 200:
                snippet += "..."
            items += f"""
            <tr>
              <td style="padding:8px 0;border-bottom:1px solid #eee">
                <strong>{r['reviewer_name']}</strong>
                <span style="color:#f4a400;margin-left:8px">{stars_html(stars)}</span>
                <span style="color:#777;margin-left:8px;font-size:12px">{r['review_date']}</span><br>
                <span style="color:#333;font-size:13px">{snippet}</span>
              </td>
            </tr>"""
        more = f"<p style='color:#777;font-size:12px'>+ {len(reviews)-10} more reviews</p>" if len(reviews) > 10 else ""
        sections.append(f"""
        <h3 style="color:#2c5282;margin:20px 0 8px">{loc_name} ({len(reviews)} new)</h3>
        <table style="width:100%;border-collapse:collapse">{items}</table>
        {more}""")

    total = len(new_rows)
    date_str = datetime.now().strftime("%B %d, %Y at %I:%M %p")
    return f"""
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="background:#2c5282;color:white;padding:16px;margin:0">
        {total} New Review{'s' if total != 1 else ''} – LTA Dashboard
      </h2>
      <p style="color:#555;padding:12px">Detected on {date_str}</p>
      {''.join(sections)}
      <p style="margin-top:24px;padding:12px;background:#f7f7f7;font-size:12px;color:#777">
        LTA Review Dashboard – auto-generated notification
      </p>
    </div>"""


def write_github_output(new_count: int, email_html: str):
    if not GITHUB_OUTPUT:
        print(f"\nResult: {new_count} new reviews found")
        return
    with open(GITHUB_OUTPUT, "a") as f:
        f.write(f"new_count={new_count}\n")
        # Multiline output uses heredoc syntax
        delimiter = "EOF_EMAIL"
        f.write(f"email_html<<{delimiter}\n{email_html}\n{delimiter}\n")


async def main():
    from playwright.async_api import async_playwright

    print(f"Starting scrape: {datetime.now()}")
    existing = load_existing()
    print(f"Existing reviews in CSV: {len(existing)}")

    conn = db.get_connection()
    db.init_schema(conn)
    run_mode = "local" if LOCAL_MODE else "cloud"
    run_cur = conn.execute(
        "INSERT INTO scraper_runs (started_at, mode, status) VALUES (?, ?, 'running')",
        (datetime.now(timezone.utc).isoformat(), run_mode),
    )
    run_id = run_cur.lastrowid
    conn.commit()
    run_stats = {"attempted": 0, "succeeded": 0, "failed": 0, "new": 0, "edited": 0, "deleted": 0}
    run_errors = []

    all_scraped = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not LOCAL_MODE)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="en-US",
        )
        for loc in LOCATIONS:
            run_stats["attempted"] += 1
            loc_started = datetime.now(timezone.utc)
            reviews, error, maps_url = await scrape_location(context, loc)
            duration_ms = int((datetime.now(timezone.utc) - loc_started).total_seconds() * 1000)

            loc_rows = [{
                "location_name":  loc["name"],
                "city":           loc["city"],
                "reviewer_name":  r["reviewer_name"],
                "review_date":    r["review_date"],
                "star_rating":    r["star_rating"],
                "review_text":    r["review_text"],
                "owner_response": r["owner_response"],
                "review_url":     r["review_url"],
            } for r in reviews]
            all_scraped.extend(loc_rows)

            # Dual-write into SQLite (source of truth going forward) alongside
            # the CSV write below (kept as a secondary, human-readable export).
            location_id = db.get_or_create_location(
                conn, loc["name"], loc["city"], db.get_brand(loc["name"]), loc["search"],
                maps_url=maps_url,
            )
            now_iso = datetime.now(timezone.utc).isoformat()
            scraped_keys = set()
            window_min_date = None
            loc_new = loc_edited = 0
            for row in loc_rows:
                db_row = dict(row)
                db_row["star_rating"] = row["star_rating"] or None
                key = db.dedup_key(loc["name"], db_row)
                scraped_keys.add(key)
                if row["review_date"] and (window_min_date is None or row["review_date"] < window_min_date):
                    window_min_date = row["review_date"]
                result = db.upsert_review(conn, location_id, loc["name"], db_row, now_iso)
                if result == "new":
                    loc_new += 1
                elif result == "edited":
                    loc_edited += 1

            loc_deleted = (
                db.detect_deletions(conn, location_id, scraped_keys, window_min_date, now_iso)
                if window_min_date else 0
            )

            if error:
                run_stats["failed"] += 1
                run_errors.append(f"{loc['name']}: {error}")
            else:
                run_stats["succeeded"] += 1
            run_stats["new"] += loc_new
            run_stats["edited"] += loc_edited
            run_stats["deleted"] += loc_deleted

            conn.execute(
                """INSERT INTO scraper_run_locations
                   (run_id, location_id, status, reviews_found, reviews_new, error_message, duration_ms)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (run_id, location_id, "error" if error else "ok",
                 len(reviews), loc_new, error, duration_ms),
            )
            conn.commit()
        await browser.close()

    run_status = "ok" if run_stats["failed"] == 0 else ("partial" if run_stats["succeeded"] > 0 else "failed")
    conn.execute(
        """UPDATE scraper_runs SET finished_at = ?, status = ?, locations_attempted = ?,
           locations_succeeded = ?, locations_failed = ?, new_reviews_count = ?,
           edited_reviews_count = ?, deleted_reviews_count = ?, error_summary = ?
           WHERE id = ?""",
        (datetime.now(timezone.utc).isoformat(), run_status, run_stats["attempted"],
         run_stats["succeeded"], run_stats["failed"], run_stats["new"], run_stats["edited"],
         run_stats["deleted"], "; ".join(run_errors) if run_errors else None, run_id),
    )
    conn.commit()
    conn.close()
    print(f"SQLite run #{run_id}: {run_stats}")

    new_rows = []
    for r in all_scraped:
        key = dedup_key(r)
        if key not in existing:
            new_rows.append(r)
            existing.add(key)

    print(f"\nNew reviews found: {len(new_rows)}")

    if new_rows:
        append_to_csv(new_rows)
        print(f"Updated {REVIEWS_CSV}")
        email_html = build_email_html(new_rows)
        write_github_output(len(new_rows), email_html)
    else:
        write_github_output(0, "")

    if LOCAL_MODE:
        import subprocess
        print("\nPushing to GitHub...")
        subprocess.run("git add dashboard/reviews.csv dashboard/reviews.db", shell=True, cwd=BASE_DIR)
        msg = f"update: {len(new_rows)} new reviews" if new_rows else "update: no new reviews"
        subprocess.run(f'git commit -m "{msg}"', shell=True, cwd=BASE_DIR)
        subprocess.run("git push", shell=True, cwd=BASE_DIR)
        print("\nDeploying to Vercel...")
        subprocess.run("vercel --prod --yes", shell=True, cwd=BASE_DIR / "dashboard")

        print("\n")
        print("=" * 50)
        if new_rows:
            from collections import Counter
            print(f"  RESULT: {len(new_rows)} NEW REVIEWS FOUND")
            print("-" * 50)
            for loc_name, cnt in Counter(r["location_name"] for r in new_rows).most_common():
                print(f"  {cnt:4d}  {loc_name}")
        else:
            print("  RESULT: No new reviews since last run.")
        print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())
