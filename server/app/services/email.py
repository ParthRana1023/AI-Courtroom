# app/services/email.py
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import settings

async def send_email(to_email: str, subject: str, body: str):
    """Send an email using SMTP"""
    message = MIMEMultipart()
    # Use a display name that shows your brand but keeps the actual Gmail address
    message["From"] = f"AI Courtroom <{settings.email_username}>"
    message["To"] = to_email
    message["Subject"] = subject
    
    message.attach(MIMEText(body, "html"))
    
    try:
        server = smtplib.SMTP(settings.smtp_server, settings.smtp_port)
        server.starttls()
        server.login(settings.email_username, settings.email_password)
        server.send_message(message)
        server.quit()
        print(f"Email sent successfully to {to_email}")
        return True
    except Exception as e:
        print(f"Failed to send email: {e}")
        return False

async def send_otp_email(email: str, otp: str, is_registration: bool = True):
    """Send OTP verification email"""
    action = "registration" if is_registration else "login"
    subject = f"Your OTP for {action} - AI Courtroom"
    body = f"""
    <html>
    <body>
        <h2>AI Courtroom - OTP Verification</h2>
        <p>Your One-Time Password (OTP) for {action} is: <strong>{otp}</strong></p>
        <p>This OTP will expire in 10 minutes.</p>
        <p>If you did not request this OTP, please ignore this email.</p>
    </body>
    </html>
    """
    return await send_email(email, subject, body)

# Add this new function to the existing email.py file

async def send_contact_email(contact_data):
    """Send contact form submission email"""
    subject = f"Contact Form Submission from {contact_data.first_name} {contact_data.last_name}"
    body = f"""
    <html>
    <body>
        <h2>AI Courtroom - Contact Form Submission</h2>
        <p><strong>Name:</strong> {contact_data.first_name} {contact_data.last_name}</p>
        <p><strong>Email:</strong> {contact_data.email}</p>
        <p><strong>Phone:</strong> {contact_data.phone_number}</p>
        <h3>Message:</h3>
        <p>{contact_data.message}</p>
    </body>
    </html>
    """
    # Using the same email address as the recipient (admin email)
    from app.config import settings
    return await send_email(settings.email_sender, subject, body)