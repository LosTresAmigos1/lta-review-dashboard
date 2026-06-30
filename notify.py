"""
notify.py - Notify Agent (Milestone 2).

Runs after validate.py/refresh_analytics.py in the pipeline and sends a
single digest email covering whatever needs a human's attention right now:
scraper failures, new low-star reviews, per-location rating drops, and
structural data bugs (duplicate review URLs). Every alert type is deduped
via notifications_log so the same underlying issue doesn't re-notify every
~6h run -- only genuinely new information re-triggers an email.

Reuses weekly_report.py's exact Gmail SMTP pattern (same env vars, same
"from" display name) rather than inventing a second mailer.
"""
import os
import smtplib
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import db

TO_ADDR = "advertising@l3amigos.com"
FROM_ADDR = os.environ.get("GMAIL_USER", "")
APP_PASS = os.environ.get("GMAIL_APP_PASSWORD", "")

RATING_DROP_THRESHOLD = 0.2
RATING_DROP_MIN_N = 5
RATING_DROP_RESEND_DAYS = 7
STRUCTURAL_RESEND_HOURS = 24


def already_notified(conn, notification_type, *, related_review_id=None, related_location_id=None, since=None) -> bool:
    query = "SELECT 1 FROM notifications_log WHERE notification_type = ?"
    params = [notification_type]
    if related_review_id is not None:
        query += " AND related_review_id = ?"
        params.append(related_review_id)
    if related_location_id is not None:
        query += " AND related_location_id = ?"
        params.append(related_location_id)
    if since is not None:
        query += " AND sent_at >= ?"
        params.append(since)
    return conn.execute(query + " LIMIT 1", params).fetchone() is not None


def log_notification(conn, notification_type, subject, *, related_review_id=None, related_location_id=None):
    conn.execute(
        """INSERT INTO notifications_log
           (sent_at, notification_type, recipient, subject, related_review_id, related_location_id)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (datetime.now(timezone.utc).isoformat(), notification_type, TO_ADDR, subject,
         related_review_id, related_location_id),
    )


def check_scraper_failure(conn) -> str:
    run = conn.execute(
        "SELECT * FROM scraper_runs WHERE status IN ('failed', 'partial') "
        "ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if not run:
        return ""
    if already_notified(conn, "scraper_failure", since=run["started_at"]):
        return ""
    subject_marker = f"run #{run['id']}"
    log_notification(conn, "scraper_failure", subject_marker)
    return (
        f"<h2 style='color:#b91c1c'>Scraper run #{run['id']} — {run['status']}</h2>"
        f"<p>{run['locations_succeeded']}/{run['locations_attempted']} locations succeeded.</p>"
        f"<p style='color:#7f1d1d'>{run['error_summary'] or 'No error detail captured.'}</p>"
    )


def check_low_star_reviews(conn) -> str:
    rows = conn.execute(
        """SELECT r.id, r.reviewer_name, r.review_text, r.star_rating, r.review_date, l.name AS location_name
           FROM reviews r JOIN locations l ON l.id = r.location_id
           WHERE r.is_deleted = 0 AND r.star_rating IS NOT NULL AND r.star_rating <= 2
           ORDER BY r.review_date DESC"""
    ).fetchall()

    fresh = []
    for r in rows:
        if already_notified(conn, "low_star_review", related_review_id=r["id"]):
            continue
        fresh.append(r)
        log_notification(conn, "low_star_review", f"{r['star_rating']}★ at {r['location_name']}",
                          related_review_id=r["id"])
    if not fresh:
        return ""

    today = datetime.now(timezone.utc).date().isoformat()
    d1 = (datetime.now(timezone.utc) - timedelta(days=1)).date().isoformat()
    spike = sum(1 for r in fresh if r["review_date"] and r["review_date"] >= d1)
    spike_note = (
        f"<p style='color:#b91c1c'><strong>{spike} arrived in the last 24h</strong> — possible spike.</p>"
        if spike >= 3 else ""
    )

    items = "".join(
        f"<li><strong>{r['star_rating']}★ — {r['location_name']}</strong> ({r['review_date']})<br>"
        f"{(r['review_text'] or '(no text)')[:200]}</li>"
        for r in fresh[:25]
    )
    return f"<h2>New low-star reviews ({len(fresh)})</h2>{spike_note}<ul>{items}</ul>"


def check_rating_drops(conn) -> str:
    today = datetime.now(timezone.utc).date().isoformat()
    d30 = (datetime.now(timezone.utc) - timedelta(days=30)).date().isoformat()
    d60 = (datetime.now(timezone.utc) - timedelta(days=60)).date().isoformat()
    resend_cutoff = (datetime.now(timezone.utc) - timedelta(days=RATING_DROP_RESEND_DAYS)).isoformat()

    rows = conn.execute(
        """SELECT r.location_id, l.name AS location_name, r.star_rating, r.review_date
           FROM reviews r JOIN locations l ON l.id = r.location_id
           WHERE r.is_deleted = 0 AND r.star_rating IS NOT NULL AND r.review_date >= ?""",
        (d60,),
    ).fetchall()

    by_loc = {}
    for r in rows:
        by_loc.setdefault(r["location_id"], {"name": r["location_name"], "cur": [], "prev": []})
        if r["review_date"] >= d30:
            by_loc[r["location_id"]]["cur"].append(r["star_rating"])
        else:
            by_loc[r["location_id"]]["prev"].append(r["star_rating"])

    alerts = []
    for loc_id, data in by_loc.items():
        cur, prev = data["cur"], data["prev"]
        if len(cur) < RATING_DROP_MIN_N or len(prev) < RATING_DROP_MIN_N:
            continue
        avg_cur = sum(cur) / len(cur)
        avg_prev = sum(prev) / len(prev)
        delta = avg_cur - avg_prev
        if abs(delta) < RATING_DROP_THRESHOLD:
            continue
        if already_notified(conn, "rating_drop", related_location_id=loc_id, since=resend_cutoff):
            continue
        direction = "dropped" if delta < 0 else "improved"
        alerts.append(
            f"<li><strong>{data['name']}</strong> {direction}: "
            f"{avg_prev:.2f}★ → {avg_cur:.2f}★ (30d avg, {len(prev)} vs {len(cur)} reviews)</li>"
        )
        log_notification(conn, "rating_drop", f"{data['name']} {direction}", related_location_id=loc_id)

    if not alerts:
        return ""
    return f"<h2>Rating shifts (30-day avg)</h2><ul>{''.join(alerts)}</ul>"


def check_structural_issues(conn) -> str:
    since = (datetime.now(timezone.utc) - timedelta(hours=STRUCTURAL_RESEND_HOURS)).isoformat()
    if already_notified(conn, "duplicate_review_url", since=since):
        return ""
    count = conn.execute(
        "SELECT COUNT(*) AS c FROM validation_flags WHERE flag_type = 'duplicate_review_url' AND resolved_at IS NULL"
    ).fetchone()["c"]
    if count == 0:
        return ""
    log_notification(conn, "duplicate_review_url", f"{count} duplicate review_url flags")
    return (
        f"<h2 style='color:#b91c1c'>Data integrity: {count} duplicate review_url flags</h2>"
        f"<p>dedup_key should make this impossible -- check validate.py / validation_flags.</p>"
    )


def send_email(subject, html):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"LTA Review Dashboard <{FROM_ADDR}>"
    msg["To"] = TO_ADDR
    msg.attach(MIMEText(html, "html"))
    with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
        smtp.login(FROM_ADDR, APP_PASS)
        smtp.sendmail(FROM_ADDR, TO_ADDR, msg.as_string())


def main():
    conn = db.get_connection()
    db.init_schema(conn)

    sections = [
        check_scraper_failure(conn),
        check_low_star_reviews(conn),
        check_rating_drops(conn),
        check_structural_issues(conn),
    ]
    conn.commit()

    sections = [s for s in sections if s]
    if not sections:
        conn.close()
        print("notify.py: nothing to report")
        return

    if not FROM_ADDR or not APP_PASS:
        conn.close()
        print(f"notify.py: {len(sections)} section(s) ready but GMAIL_USER/GMAIL_APP_PASSWORD not set, skipping send")
        return

    html = "<html><body style='font-family:sans-serif;max-width:640px;margin:0 auto'>" + "".join(sections) + "</body></html>"
    subject = f"LTA Dashboard Alert — {datetime.now(timezone.utc).strftime('%b %d, %Y')}"
    send_email(subject, html)
    conn.close()
    print(f"notify.py: sent email with {len(sections)} section(s)")


if __name__ == "__main__":
    main()
