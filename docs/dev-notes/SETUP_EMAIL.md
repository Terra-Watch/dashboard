# Email Setup for TerraWatch

## Quick Setup with Mailtrap (Recommended)

### Step 1: Get SMTP Credentials

1. Go to https://mailtrap.io
2. Sign in (or create free account)
3. Click **Email Testing** in left sidebar
4. Click **My Inbox** (or create new inbox)
5. Find **SMTP Settings** section
6. Copy the credentials that look like:
   ```
   Host: sandbox.smtp.mailtrap.io
   Port: 2525
   Username: abc123def456
   Password: xyz789abc123
   ```

### Step 2: Configure TerraWatch

Edit `backend/.env` and uncomment these lines with YOUR credentials:

```bash
SMTP_HOST=sandbox.smtp.mailtrap.io
SMTP_PORT=2525
SMTP_USER=<paste-your-username-here>
SMTP_PASSWORD=<paste-your-password-here>
SMTP_FROM=noreply@terrawatch.local
PUBLIC_BASE_URL=http://localhost:5173
```

### Step 3: Restart Backend

```bash
cd backend
# Stop the current backend (Ctrl+C)
source .venv/bin/activate
uvicorn app.main:app --reload --port 8000
```

### Step 4: Test Email

1. Go to http://localhost:5173
2. Click "Forgot your password?"
3. Enter an email address
4. Check your Mailtrap inbox to see the email!

---

## What You Have vs What You Need

**You shared:** Mailtrap **API Token** (`b856aaac2b0f10ea0ee76d14f1278490`)
- This is for the Mailtrap API (sending real emails via their service)
- Used with their JavaScript/Node SDK
- **Not what TerraWatch needs**

**What TerraWatch needs:** Mailtrap **SMTP Credentials**
- Username (usually looks like: `abc123def456`)
- Password (usually looks like: `xyz789abc123`)
- Used for testing (catches emails without sending)
- **Free tier: 500 emails/month**

---

## Without Email Configured

The app works fine without email! When email is not configured:

- ✅ All features work normally
- ✅ Users can still sign in
- ⚠️ Password reset shows a link instead of sending email
- ⚠️ Staff invitations show a link to copy/paste
- 📝 The admin just copies the link and sends it manually

So email is **optional** for development!
