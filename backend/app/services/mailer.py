"""Outgoing email through the operator's own SMTP server. Nothing is sent unless every required setting is present."""
import logging
import os
import smtplib
from email.message import EmailMessage

logger = logging.getLogger(__name__)


def email_configured() -> bool:
    return all(os.environ.get(name) for name in ('SMTP_HOST', 'SMTP_FROM', 'PUBLIC_BASE_URL'))


def public_base_url() -> str:
    return os.environ.get('PUBLIC_BASE_URL', '').rstrip('/')


def send_email(to: str, subject: str, body: str) -> bool:
    """Returns True only when the SMTP server accepted the message. Never raises; never logs the body (it can hold a reset link)."""
    if not email_configured():
        return False
    message = EmailMessage()
    message['From'], message['To'], message['Subject'] = os.environ['SMTP_FROM'], to, subject
    message.set_content(body)
    try:
        with smtplib.SMTP(os.environ['SMTP_HOST'], int(os.environ.get('SMTP_PORT', '587')), timeout=10) as smtp:
            smtp.starttls()
            if os.environ.get('SMTP_USER'):
                smtp.login(os.environ['SMTP_USER'], os.environ.get('SMTP_PASSWORD', ''))
            smtp.send_message(message)
        return True
    except Exception as exc:  # delivery problems must not break the request or reveal whether the account exists
        logger.warning('email delivery failed: %s', type(exc).__name__)
        return False
