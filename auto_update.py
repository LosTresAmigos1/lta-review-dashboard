"""
Headless scraper for all 21 LTA restaurants.
Run by GitHub Actions every 4 hours.
Writes new reviews to dashboard/reviews.csv and outputs GitHub Actions variables.
"""
import os
import sys
import csv
import re
import asyncio
from datetime import datetime, timedelta
from pathlib import Path
from collections import defaultdict

BASE_DIR = Path(__file__).parent
REVIEWS_CSV = BASE_DIR / "dashboard" / "reviews.csv"
GITHUB_OUTPUT = os.environ.get("GITHUB_OUTPUT", "")

LOCAL_MODE = "--local" in sys.argv  # headed browser, more reviews, git push + vercel deploy
MAX_REVIEWS = 500 if LOCAL_MODE else 200

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


async def expand_review_text(page):
    for sel in ['button[aria-label*="See more"]', 'button.w8nwRe']:
        try:
            btns = await page.query_selector_all(sel)
            for btn in btns:
                try:
                    await btn.click()
                    await page.wait_for_timeout(60)
                except Exception:
                    pass
        except Exception:
            pass


async def extract_reviews(page) -> list:
    reviews = []
    seen_ids = set()
    els = await page.query_selector_all('[data-review-id]')
    for el in els:
        try:
            rid = await el.get_attribute("data-review-id") or ""
            if rid in seen_ids:
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
            review_date = relative_to_date(date_str)

            text = ""
            for sel in ['.MyEned span[jslog]', '.MyEned span:not([jslog])', '.wiI7pd span']:
                te = await el.query_selector(sel)
                if te:
                    text = (await te.inner_text()).strip()
                    if text:
                        break

            owner_resp = ""
            for sel in ['.CDe7pd .MyEned span[jslog]', '.CDe7pd span']:
                re_el = await el.query_selector(sel)
                if re_el:
                    owner_resp = (await re_el.inner_text()).strip()
                    if owner_resp:
                        break

            if name or text:
                reviews.append({
                    "reviewer_name":  name,
                    "star_rating":    stars,
                    "review_date":    review_date,
                    "review_text":    text,
                    "owner_response": owner_resp,
                    "review_url":     f"https://www.google.com/maps/reviews/{rid}" if rid else "",
                })
        except Exception:
            pass
    return reviews


async def go_to_reviews_tab(page):
    for sel in ['button[aria-label^="Reviews"]', 'button[aria-label*=" reviews"]',
                '[role="tab"]:has-text("Reviews")']:
        try:
            btn = page.locator(sel).first
            if await btn.is_visible(timeout=3000):
                await btn.click()
                await page.wait_for_timeout(1500)
                return True
        except Exception:
            pass
    tabs = await page.query_selector_all('[role="tab"], button[data-tab-index]')
    for tab in tabs:
        try:
            txt = (await tab.inner_text()).lower()
            if "review" in txt:
                await tab.click()
                await page.wait_for_timeout(1500)
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
    for i in range(300):
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


async def scrape_location(context, loc) -> list:
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

        for sel in ['.Nv2PK', '.hfpxzc', 'a[href*="/maps/place/"]']:
            try:
                first = page.locator(sel).first
                if await first.is_visible(timeout=2000):
                    await first.click()
                    await page.wait_for_timeout(2500)
                    break
            except Exception:
                pass

        if not await go_to_reviews_tab(page):
            await page.wait_for_timeout(2000)
            if not await go_to_reviews_tab(page):
                print(f"    [SKIP] no Reviews tab found")
                return []

        await sort_by_newest(page)
        await scroll_reviews(page, MAX_REVIEWS)
        await expand_review_text(page)
        reviews = await extract_reviews(page)
        print(f"    -> {len(reviews)} reviews scraped")
        return reviews
    except Exception as e:
        print(f"    [ERR] {e}")
        return []
    finally:
        await page.close()


def load_existing() -> set:
    if not REVIEWS_CSV.exists():
        return set()
    with REVIEWS_CSV.open(encoding="utf-8") as f:
        return set(
            (r["location_name"], r["reviewer_name"], r["review_date"], r["star_rating"])
            for r in csv.DictReader(f)
        )


def append_to_csv(new_rows: list):
    with REVIEWS_CSV.open(encoding="utf-8") as f:
        existing = list(csv.DictReader(f))
    existing.extend(new_rows)
    with REVIEWS_CSV.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDNAMES, quoting=csv.QUOTE_ALL)
        w.writeheader()
        w.writerows(existing)


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

    all_scraped = []
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=not LOCAL_MODE)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            locale="en-US",
        )
        for loc in LOCATIONS:
            reviews = await scrape_location(context, loc)
            for r in reviews:
                all_scraped.append({
                    "location_name":  loc["name"],
                    "city":           loc["city"],
                    "reviewer_name":  r["reviewer_name"],
                    "review_date":    r["review_date"],
                    "star_rating":    r["star_rating"],
                    "review_text":    r["review_text"],
                    "owner_response": r["owner_response"],
                    "review_url":     r["review_url"],
                })
        await browser.close()

    new_rows = []
    for r in all_scraped:
        key = (r["location_name"], r["reviewer_name"], r["review_date"], r["star_rating"])
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
        subprocess.run("git add dashboard/reviews.csv", shell=True, cwd=BASE_DIR)
        msg = f"update: {len(new_rows)} new reviews" if new_rows else "update: no new reviews"
        subprocess.run(f'git commit -m "{msg}"', shell=True, cwd=BASE_DIR)
        subprocess.run("git push", shell=True, cwd=BASE_DIR)
        print("\nDeploying to Vercel...")
        subprocess.run("vercel --prod --yes", shell=True, cwd=BASE_DIR / "dashboard")


if __name__ == "__main__":
    asyncio.run(main())
