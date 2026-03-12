import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import logging
from typing import Optional
from sqlalchemy.orm import Session
from app.models.db import EmailConfig

logger = logging.getLogger(__name__)

def send_email(
    db: Session,
    recipient_email: str,
    subject: str,
    body: str,
    is_html: bool = False
) -> bool:
    """Send an email using the configured SMTP settings in the database"""
    config = db.query(EmailConfig).first()
    if not config or not config.smtp_provider or not config.email_address or not config.app_password:
        logger.error("Email configuration is incomplete")
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = f"{config.sender_name or 'MySmartNotes'} <{config.email_address}>"
        msg['To'] = recipient_email
        msg['Subject'] = subject

        msg.attach(MIMEText(body, 'html' if is_html else 'plain'))

        # Split provider into host and port if needed
        host = config.smtp_provider
        port = 587 # Default TLS port
        if ":" in host:
            host, port_str = host.split(":")
            port = int(port_str)

        server = smtplib.SMTP(host, port)
        server.starttls()
        server.login(config.email_address, config.app_password)
        server.send_message(msg)
        server.quit()
        
        logger.info(f"Email sent successfully to {recipient_email}")
        return True
    except Exception as e:
        logger.error(f"Failed to send email to {recipient_email}: {e}")
        return False

def send_invitation_email(db: Session, recipient_email: str, invitation_link: str) -> bool:
    """Send an invitation email to a new user"""
    subject = "You're invited to join MySmartNotes!"
    body = f"""
    <html>
        <body>
            <h2>Welcome to MySmartNotes!</h2>
            <p>You have been invited to join MySmartNotes, your AI-powered study companion.</p>
            <p>Click the link below to create your account and get started:</p>
            <p><a href="{invitation_link}">{invitation_link}</a></p>
            <p>If you didn't expect this invitation, you can safely ignore this email.</p>
            <br>
            <p>Best regards,<br>The MySmartNotes Team</p>
        </body>
    </html>
    """
    return send_email(db, recipient_email, subject, body, is_html=True)
