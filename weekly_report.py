"""
Weekly review summary email. Runs every Monday via GitHub Actions.
Reads dashboard/reviews.csv (no scraping needed).
"""
import csv
import os
import re
import smtplib
from collections import Counter, defaultdict
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path

BASE_DIR   = Path(__file__).parent
REVIEWS_CSV = BASE_DIR / "dashboard" / "reviews.csv"
TO_ADDR    = "advertising@l3amigos.com"
FROM_ADDR  = os.environ.get("GMAIL_USER", "")
APP_PASS   = os.environ.get("GMAIL_APP_PASSWORD", "")

STOP_WORDS = {
    'a','an','the','is','are','was','were','be','been','have','has','had',
    'do','does','did','will','would','could','should','to','of','in','for',
    'on','with','at','by','from','and','or','but','not','this','that','it',
    'its','we','you','he','she','they','i','me','us','him','her','our',
    'just','got','go','get','came','come','also','very','really','good',
    'great','nice','bad','ok','okay','food','place','restaurant','time',
    'service','staff','always','never','still','now','even','back','out',
}


def load_reviews():
    with REVIEWS_CSV.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    for r in rows:
        try:
            r["star_rating"] = int(r["star_rating"])
        except (ValueError, KeyError):
            r["star_rating"] = 0
    return rows


def top_complaint_words(reviews, n=8):
    words = Counter()
    for r in reviews:
        text = (r.get("review_text") or "").lower()
        text = re.sub(r"[^a-z\s]", " ", text)
        for w in text.split():
            if len(w) > 3 and w not in STOP_WORDS:
                words[w] += 1
    return words.most_common(n)


def stars_html(n):
    return "&#9733;" * n + "&#9734;" * (5 - n)


def build_html(data):
    week_str = data["week_str"]
    total    = data["total_new"]
    by_loc   = data["by_location"]
    avg_now  = data["avg_now"]
    avg_prev = data["avg_prev"]
    unanswered = data["unanswered"]
    complaints = data["complaints"]

    # Location rows
    loc_rows = ""
    for loc, cnt in sorted(by_loc.items(), key=lambda x: -x[1]):
        cur  = avg_now.get(loc)
        prev = avg_prev.get(loc)
        if cur and prev:
            delta = cur - prev
            if abs(delta) >= 0.15:
                arrow = f'<span style="color:{"#dc2626" if delta < 0 else "#16a34a"}">' \
                        f'{"▼" if delta < 0 else "▲"} {abs(delta):.2f}</span>'
            else:
                arrow = '<span style="color:#6b7280">stable</span>'
            rating_cell = f'{cur:.2f} ★ &nbsp;{arrow}'
        elif cur:
            rating_cell = f'{cur:.2f} ★'
        else:
            rating_cell = '—'

        loc_rows += f"""
        <tr style="border-bottom:1px solid #e5e7eb">
          <td style="padding:8px 12px;font-size:13px;color:#1f2937">{loc}</td>
          <td style="padding:8px 12px;font-size:13px;text-align:center;font-weight:600;color:#d97706">{cnt}</td>
          <td style="padding:8px 12px;font-size:13px;text-align:center">{rating_cell}</td>
        </tr>"""

    # Complaint keywords
    complaint_chips = ""
    for word, cnt in complaints:
        complaint_chips += f'<span style="display:inline-block;background:#fee2e2;color:#991b1b;border-radius:999px;padding:3px 10px;margin:3px;font-size:12px;font-weight:600">{word} ({cnt}×)</span>'

    # Unanswered alert
    unanswered_block = ""
    if unanswered > 0:
        unanswered_block = f"""
        <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;margin:20px 0">
          <p style="margin:0;font-weight:700;color:#dc2626;font-size:14px">
            &#9888; {unanswered} unanswered 1–2 star review{"s" if unanswered != 1 else ""} need a response.
          </p>
          <p style="margin:6px 0 0;font-size:12px;color:#6b7280">
            Responding to negative reviews improves your Google local ranking. Log into the dashboard to see them.
          </p>
        </div>"""

    no_new_block = ""
    if total == 0:
        no_new_block = '<p style="color:#6b7280;font-size:14px">No new reviews were detected in the data this week.</p>'

    loc_heading = "<h3 style='margin:0 0 12px;font-size:14px;font-weight:700;color:#374151'>New Reviews by Location</h3>" if by_loc else ""
    loc_table   = (
        '<table style="width:100%;border-collapse:collapse;margin-bottom:24px">'
        '<thead><tr style="background:#f3f4f6">'
        '<th style="padding:8px 12px;font-size:12px;text-align:left;color:#6b7280">Location</th>'
        '<th style="padding:8px 12px;font-size:12px;text-align:center;color:#6b7280">New Reviews</th>'
        '<th style="padding:8px 12px;font-size:12px;text-align:center;color:#6b7280">30-day avg (vs prior)</th>'
        f'</tr></thead><tbody>{loc_rows}</tbody></table>'
    ) if by_loc else ""
    complaint_heading = "<h3 style='margin:0 0 8px;font-size:14px;font-weight:700;color:#374151'>Top Complaint Keywords This Week</h3>" if complaints else ""
    complaint_sub     = "<p style='font-size:12px;color:#6b7280;margin:0 0 12px'>Words appearing most in 1-2 star reviews</p>" if complaints else ""
    complaint_block   = f"<div style='margin-bottom:24px'>{complaint_chips}</div>" if complaints else ""

    return f"""<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;max-width:620px;margin:0 auto;background:#f9fafb;padding:20px">
  <div style="background:#1c1917;color:white;border-radius:12px 12px 0 0;padding:20px 24px">
    <p style="margin:0 0 2px;font-size:11px;font-weight:700;letter-spacing:2px;color:#f59e0b;text-transform:uppercase">Future Marketing Studio</p>
    <h1 style="margin:0;font-size:20px;font-weight:700">Weekly Review Summary</h1>
    <p style="margin:6px 0 0;font-size:13px;color:#a8a29e">{week_str}</p>
  </div>

  <div style="background:white;border-radius:0 0 12px 12px;padding:24px;box-shadow:0 2px 8px rgba(0,0,0,0.06)">

    <div style="display:flex;gap:16px;margin-bottom:24px">
      <div style="flex:1;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:16px;text-align:center">
        <p style="margin:0;font-size:28px;font-weight:700;color:#d97706">{total}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280">New reviews this week</p>
      </div>
      <div style="flex:1;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:16px;text-align:center">
        <p style="margin:0;font-size:28px;font-weight:700;color:#dc2626">{unanswered}</p>
        <p style="margin:4px 0 0;font-size:12px;color:#6b7280">Unanswered 1–2 star reviews</p>
      </div>
    </div>

    {unanswered_block}
    {no_new_block}

    {loc_heading}
    {loc_table}

    {complaint_heading}
    {complaint_sub}
    {complaint_block}

    <p style="margin:24px 0 0;font-size:11px;color:#9ca3af;text-align:center">
      LTA Review Dashboard · Auto-generated weekly report<br>
      View full dashboard for details on each location.
    </p>
  </div>
</body>
</html>"""


def send_email(subject, html, to_addr, from_addr, password):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"]    = f"LTA Review Dashboard <{from_addr}>"
    msg["To"]      = to_addr
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(from_addr, password)
        smtp.sendmail(from_addr, to_addr, msg.as_string())


def main():
    if not FROM_ADDR or not APP_PASS:
        print("Missing GMAIL_USER or GMAIL_APP_PASSWORD env vars")
        return

    reviews = load_reviews()
    today   = datetime.now()
    d7      = (today - timedelta(days=7)).strftime("%Y-%m-%d")
    d30     = (today - timedelta(days=30)).strftime("%Y-%m-%d")
    d60     = (today - timedelta(days=60)).strftime("%Y-%m-%d")
    today_s = today.strftime("%Y-%m-%d")

    new_reviews  = [r for r in reviews if r["review_date"] >= d7]
    by_location  = dict(Counter(r["location_name"] for r in new_reviews))

    # 30-day avg per location now vs prior 30 days
    avg_now  = {}
    avg_prev = {}
    for loc in set(r["location_name"] for r in reviews):
        cur  = [r for r in reviews if r["location_name"] == loc and r["review_date"] >= d30]
        prev = [r for r in reviews if r["location_name"] == loc and r["review_date"] >= d60 and r["review_date"] < d30]
        if cur:  avg_now[loc]  = sum(r["star_rating"] for r in cur)  / len(cur)
        if prev: avg_prev[loc] = sum(r["star_rating"] for r in prev) / len(prev)

    unanswered = sum(1 for r in reviews if r["star_rating"] <= 2 and not (r.get("owner_response") or "").strip())

    neg_this_week = [r for r in new_reviews if r["star_rating"] <= 2]
    complaints    = top_complaint_words(neg_this_week) if neg_this_week else []

    week_str = f"Week of {(today - timedelta(days=7)).strftime('%B %d')} – {today.strftime('%B %d, %Y')}"

    html = build_html({
        "week_str":    week_str,
        "total_new":   len(new_reviews),
        "by_location": by_location,
        "avg_now":     avg_now,
        "avg_prev":    avg_prev,
        "unanswered":  unanswered,
        "complaints":  complaints,
    })

    subject = f"Weekly Review Report – {len(new_reviews)} new reviews – {today.strftime('%b %d')}"
    send_email(subject, html, TO_ADDR, FROM_ADDR, APP_PASS)
    print(f"Email sent to {TO_ADDR}: {len(new_reviews)} new reviews, {unanswered} unanswered")


if __name__ == "__main__":
    main()
