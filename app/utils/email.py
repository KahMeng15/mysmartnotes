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

def send_password_reset_email(db: Session, recipient_email: str, reset_link: str) -> bool:
    """Send a password reset email to a user"""
    subject = "Password Reset Request - MySmartNotes"
    body = f"""
    <html>
        <body>
            <h2>Password Reset Request</h2>
            <p>We received a request to reset the password for your MySmartNotes account.</p>
            <p>Click the link below to reset your password:</p>
            <p><a href="{reset_link}" style="display: inline-block; padding: 12px 24px; background-color: #3b82f6; color: white; text-decoration: none; border-radius: 6px; font-weight: 600;">Reset Password</a></p>
            <p>Or copy and paste this link in your browser:</p>
            <p><small>{reset_link}</small></p>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">This link will expire in 24 hours.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
            <br>
            <p>Best regards,<br>The MySmartNotes Team</p>
        </body>
    </html>
    """
    return send_email(db, recipient_email, subject, body, is_html=True)

def send_password_change_confirmation_email(db: Session, recipient_email: str, confirmation_code: str) -> bool:
    """Send a password change confirmation email to a user"""
    subject = "Confirm Your Password Change - MySmartNotes"
    body = f"""
    <html>
        <body>
            <h2>Confirm Your Password Change</h2>
            <p>A password change has been requested for your MySmartNotes account.</p>
            <p>Your confirmation code is:</p>
            <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px; color: #3b82f6; background: #f0f0f0; padding: 15px; border-radius: 6px; text-align: center;">{confirmation_code}</p>
            <p>Enter this code in the settings page to complete your password change.</p>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">This code will expire in 1 hour.</p>
            <p style="color: #666; font-size: 14px;">If you didn't request this, you can safely ignore this email. Your password will remain unchanged.</p>
            <br>
            <p>Best regards,<br>The MySmartNotes Team</p>
        </body>
    </html>
    """
    return send_email(db, recipient_email, subject, body, is_html=True)
