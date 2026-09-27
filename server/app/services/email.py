# app/services/email.py
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings
from app.logging_config import get_logger

logger = get_logger(__name__)


async def send_email(to_email: str, subject: str, body: str):
    """Send an email using SMTP"""
    message = MIMEMultipart()
    # Use a display name that shows your brand but keeps the actual Gmail address
    message["From"] = f"AI Courtroom <{settings.email_username}>"
    message["To"] = to_email
    message["Subject"] = subject

    message.attach(MIMEText(body, "html"))

    try:
        logger.debug(
            f"Connecting to SMTP server: {settings.smtp_server}:{settings.smtp_port}"
        )
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.email_username, settings.email_password)
        server.send_message(message)
        server.quit()
        logger.info(f"Email sent successfully to {to_email}")
        return True
    except Exception:
        logger.exception(f"Failed to send email to {to_email}")
        return False


async def send_otp_email(email: str, otp: str, is_registration: bool = True):
    """Send OTP verification email"""
    action = "registration" if is_registration else "login"
    logger.info(f"Sending OTP email for {action} to: {email}")

    subject = f"Your OTP for {action} - AI Courtroom"
    body = f"""
    <html>
    <body>
        <h2>AI Courtroom - OTP Verification</h2>
        <p>Your One-Time Password (OTP) for {action} is: <strong>{otp}</strong></p>
        <p>This OTP will expire in {settings.otp_expire_minutes} minutes.</p>
        <p>If you did not request this OTP, please ignore this email.</p>
    </body>
    </html>
    """
    result = await send_email(email, subject, body)
    if result:
        logger.debug(f"OTP email sent for {action}: {email}")
    else:
        logger.warning(f"OTP email failed for {action}: {email}")
    return result
