"""
health_check.py - Health-check Agent (Milestone 2).

Runs on its own daily schedule (.github/workflows/health-check.yml), separate
from the ~6h scrape cron, so it keeps working even if the scrape workflow
itself stops firing entirely -- the exact failure mode ("a workflow quietly
stops and nobody notices") this project already lived through once.

Two independent checks against scraper_runs:
1. Stuck run: a row still status='running' long after it should have
   finished (auto_update.py crashed before its final UPDATE, e.g. a browser
   launch failure killed the process outright).
2. Stale pipeline: no run has finished successfully in too long, which
   catches a dead/disabled cron trigger even if no individual run ever
   errored.

Reuses weekly_report.py's Gmail SMTP pattern. Dedup via notifications_log
with a resend window, so a still-broken pipeline re-alerts daily rather than
once and then going silent, but doesn't spam every run.
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

STUCK_RUN_THRESHOLD = timedelta(hours=2)       # a scrape cycle should never take this long
STALE_PIPELINE_THRESHOLD = timedelta(hours=14)  # ~2x the 6h cron interval
RESEND_WINDOW = timedelta(hours=20)             # re-alert daily, not every health-check run


def already_notified(conn, notification_type, since: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM notifications_log WHERE notification_type = ? AND sent_at >= ? LIMIT 1",
        (notification_type, since),
    ).fetchone() is not None


def log_notification(conn, notification_type, subject):
    conn.execute(
        """INSERT INTO notifications_log (sent_at, notification_type, recipient, subject)
           VALUES (?, ?, ?, ?)""",
        (datetime.now(timezone.utc).isoformat(), notification_type, TO_ADDR, subject),
    )


def check_stuck_run(conn, now: datetime) -> str:
    resend_cutoff = (now - RESEND_WINDOW).isoformat()
    if already_notified(conn, "stuck_run", resend_cutoff):
        return ""
    row = conn.execute(
        "SELECT * FROM scraper_runs WHERE status = 'running' ORDER BY id DESC LIMIT 1"
    ).fetchone()
    if not row:
        return ""
    started = datetime.fromisoformat(row["started_at"])
    if now - started < STUCK_RUN_THRESHOLD:
        return ""
    log_notification(conn, "stuck_run", f"run #{row['id']} stuck since {row['started_at']}")
    return (
        f"<h2 style='color:#b91c1c'>Scraper run #{row['id']} appears stuck</h2>"
        f"<p>Started {row['started_at']} ({now - started} ago) and never finished -- "
        f"likely a crash before auto_update.py reached its final status update.</p>"
    )


def check_stale_pipeline(conn, now: datetime) -> str:
    resend_cutoff = (now - RESEND_WINDOW).isoformat()
    if already_notified(conn, "stale_pipeline", resend_cutoff):
        return ""
    row = conn.execute(
        "SELECT * FROM scraper_runs WHERE status IN ('ok', 'partial') ORDER BY finished_at DESC LIMIT 1"
    ).fetchone()
    if row is None:
        last_finished = None
    else:
        last_finished = datetime.fromisoformat(row["finished_at"])

    if last_finished is not None and now - last_finished < STALE_PIPELINE_THRESHOLD:
        return ""

    log_notification(conn, "stale_pipeline", f"no successful run since {last_finished}")
    if last_finished is None:
        detail = "No successful scraper run found at all."
    else:
        detail = f"Last successful run finished {last_finished.isoformat()} ({now - last_finished} ago)."
    return (
        f"<h2 style='color:#b91c1c'>Scraper pipeline looks stale</h2>"
        f"<p>{detail} Expected at least one successful run every "
        f"~{STALE_PIPELINE_THRESHOLD}. Check whether the cron trigger is still firing.</p>"
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
    now = datetime.now(timezone.utc)

    sections = [check_stuck_run(conn, now), check_stale_pipeline(conn, now)]
    conn.commit()

    sections = [s for s in sections if s]
    if not sections:
        conn.close()
        print("health_check.py: pipeline healthy")
        return

    if not FROM_ADDR or not APP_PASS:
        conn.close()
        print(f"health_check.py: {len(sections)} issue(s) found but GMAIL_USER/GMAIL_APP_PASSWORD not set, skipping send")
        return

    html = "<html><body style='font-family:sans-serif;max-width:640px;margin:0 auto'>" + "".join(sections) + "</body></html>"
    subject = f"LTA Dashboard Health Alert — {now.strftime('%b %d, %Y')}"
    send_email(subject, html)
    conn.close()
    print(f"health_check.py: sent email with {len(sections)} issue(s)")


if __name__ == "__main__":
    main()
