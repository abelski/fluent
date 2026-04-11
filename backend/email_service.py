# Simple SMTP email sender used by admin endpoints to notify users.
# Reads connection credentials from environment variables so they can differ
# between local dev and production without code changes.
#
# Required env vars:
#   SMTP_HOST   — e.g. smtp.gmail.com
#   SMTP_PORT   — e.g. 465 (SSL) or 587 (TLS)
#   SMTP_USER   — sender email address / login
#   SMTP_PASS   — app password or SMTP password
#   SMTP_FROM   — "From" display address, e.g. "Fluent <no-reply@fluent.lt>"

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def send_email(to: str, subject: str, body: str) -> None:
    """Send a plain-text email via SMTP SSL.

    Raises RuntimeError if SMTP env vars are not configured.
    Raises smtplib.SMTPException on delivery failure.
    """
    host = os.getenv("SMTP_HOST")
    port_str = os.getenv("SMTP_PORT", "465")
    user = os.getenv("SMTP_USER")
    password = os.getenv("SMTP_PASS")
    from_addr = os.getenv("SMTP_FROM") or user

    if not host or not user or not password:
        raise RuntimeError(
            "Email not configured: set SMTP_HOST, SMTP_USER, and SMTP_PASS env vars"
        )

    port = int(port_str)

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.attach(MIMEText(body, "plain", "utf-8"))

    if port == 465:
        with smtplib.SMTP_SSL(host, port) as server:
            server.login(user, password)
            server.sendmail(from_addr, [to], msg.as_string())
    else:
        # Port 587 (STARTTLS)
        with smtplib.SMTP(host, port) as server:
            server.starttls()
            server.login(user, password)
            server.sendmail(from_addr, [to], msg.as_string())
