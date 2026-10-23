# app/services/email.py
import asyncio
import html
import smtplib
from email.mime.application import MIMEApplication
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import settings
from app.logging_config import get_logger
from app.services import health

logger = get_logger(__name__)


SMTP_TIMEOUT = 15  # seconds: a stalled server mustn't hold a worker thread for good


def _deliver(message: MIMEMultipart) -> None:
    """Blocking SMTP round trip; run it in a thread so requests aren't held up."""
    with smtplib.SMTP(
        settings.smtp_server, settings.smtp_port, timeout=SMTP_TIMEOUT
    ) as server:
        server.starttls()
        server.login(settings.email_username, settings.email_password)
        server.send_message(message)


async def send_email(
    to_email: str,
    subject: str,
    body: str,
    attachments: tuple[tuple[str, bytes], ...] = (),
    headers: dict[str, str] | None = None,
):
    """Send an email using SMTP, with optional (filename, bytes) attachments and
    extra headers (List-Unsubscribe on optional emails)."""
    message = MIMEMultipart()
    # Use a display name that shows your brand but keeps the actual Gmail address
    message["From"] = f"AI Courtroom <{settings.email_username}>"
    message["To"] = to_email
    message["Subject"] = subject
    for name, value in (headers or {}).items():
        message[name] = value

    message.attach(MIMEText(body, "html"))
    for filename, data in attachments:
        part = MIMEApplication(data, Name=filename)
        part["Content-Disposition"] = f'attachment; filename="{filename}"'
        message.attach(part)

    try:
        logger.debug(
            f"Connecting to SMTP server: {settings.smtp_server}:{settings.smtp_port}"
        )
        await asyncio.to_thread(_deliver, message)
        logger.info(f"Email sent successfully to {to_email}")
        health.record("auth", ok=True)
        return True
    except Exception:
        logger.exception(f"Failed to send email to {to_email}")
        health.record("auth", ok=False)
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


async def send_password_reset_email(email: str, link: str) -> bool:
    """Send the link that lets the user set a new password."""
    logger.info(f"Sending password reset email to: {email}")
    subject = "Reset your password - AI Courtroom"
    body = f"""
    <html>
    <body>
        <h2>AI Courtroom - Reset your password</h2>
        <p>Someone asked to reset the password for this account.</p>
        <p><a href="{link}">Set a new password</a></p>
        <p>This link expires in {settings.password_reset_expire_minutes} minutes.
        Setting a new password signs you out on your other devices.</p>
        <p>If you did not ask for this, you can ignore this email.</p>
    </body>
    </html>
    """
    return await send_email(email, subject, body)


async def send_delete_code_email(email: str, code: str) -> bool:
    """The code that confirms deleting the account."""
    body = f"""
    <html>
    <body>
        <h2>AI Courtroom - Confirm account deletion</h2>
        <p>Your code to delete your AI Courtroom account is: <strong>{code}</strong></p>
        <p>It expires in {settings.otp_expire_minutes} minutes.</p>
        <p>If you did not ask to delete your account, change your password now.</p>
    </body>
    </html>
    """
    return await send_email(email, "Confirm account deletion - AI Courtroom", body)


async def send_security_alert(email: str, subject: str, lines: list[str]) -> bool:
    """New sign-ins, password changes and deletion. Always sent, with no opt-out."""
    paragraphs = "".join(f"<p>{line}</p>" for line in lines)
    body = f"""
    <html>
    <body>
        <h2>AI Courtroom - {subject}</h2>
        {paragraphs}
        <p>If this wasn't you, change your password and sign out other devices in
        Settings, or contact us.</p>
    </body>
    </html>
    """
    return await send_email(email, f"{subject} - AI Courtroom", body)


async def send_email_change_code(email: str, code: str) -> bool:
    """The code that proves this address belongs to whoever is adding it."""
    body = f"""
    <html>
    <body>
        <h2>AI Courtroom - Confirm your email</h2>
        <p>Your code to add this email to your AI Courtroom account is: <strong>{code}</strong></p>
        <p>It expires in {settings.otp_expire_minutes} minutes.</p>
        <p>If you did not ask for this, you can ignore this email.</p>
    </body>
    </html>
    """
    return await send_email(email, "Confirm your email - AI Courtroom", body)


async def send_recovery_request_email(fields: dict[str, str | None]) -> bool:
    """Tell support (our own mailbox) that someone asked to recover an account."""
    rows = "".join(
        f"<p><strong>{label}:</strong> {html.escape(value or '-')}</p>"
        for label, value in fields.items()
    )
    body = f"""
    <html>
    <body>
        <h2>AI Courtroom - Account recovery request</h2>
        {rows}
        <p>Restore it with POST /admin/accounts/{{id-or-email}}/restore within 30 days
        of deletion.</p>
    </body>
    </html>
    """
    return await send_email(
        settings.email_username, "Account recovery request - AI Courtroom", body
    )
