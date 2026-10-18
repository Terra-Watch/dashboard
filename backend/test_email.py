#!/usr/bin/env python3
"""Quick test to verify Mailtrap SMTP configuration works."""

import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from dotenv import load_dotenv

load_dotenv()

def test_email():
    smtp_host = os.getenv('SMTP_HOST')
    smtp_port = int(os.getenv('SMTP_PORT', '2525'))
    smtp_user = os.getenv('SMTP_USER')
    smtp_password = os.getenv('SMTP_PASSWORD')
    smtp_from = os.getenv('SMTP_FROM')
    
    if not all([smtp_host, smtp_port, smtp_user, smtp_password, smtp_from]):
        print('❌ Email configuration incomplete. Check .env file.')
        return False
    
    try:
        # Create message
        msg = MIMEMultipart('alternative')
        msg['Subject'] = 'TerraWatch Email Test'
        msg['From'] = smtp_from
        msg['To'] = 'test@example.com'
        
        text = 'This is a test email from TerraWatch. If you see this in Mailtrap, SMTP is working!'
        html = f"""
        <html>
          <body>
            <h2>✅ TerraWatch Email Test</h2>
            <p>This is a test email from TerraWatch.</p>
            <p>If you see this in your Mailtrap inbox, SMTP is configured correctly!</p>
            <hr>
            <p><small>Sent from: {smtp_from}<br>Via: {smtp_host}</small></p>
          </body>
        </html>
        """
        
        msg.attach(MIMEText(text, 'plain'))
        msg.attach(MIMEText(html, 'html'))
        
        # Connect and send
        print(f'📧 Connecting to {smtp_host}:{smtp_port}...')
        with smtplib.SMTP(smtp_host, smtp_port) as server:
            server.login(smtp_user, smtp_password)
            server.send_message(msg)
        
        print('✅ Test email sent successfully!')
        print(f'   Check your Mailtrap inbox at: https://mailtrap.io/inboxes')
        return True
        
    except Exception as e:
        print(f'❌ Failed to send test email: {e}')
        return False

if __name__ == '__main__':
    print('Testing TerraWatch email configuration...\n')
    success = test_email()
    exit(0 if success else 1)
