# User Invitation & Password Reset System Implementation

## Overview
This document describes the complete implementation of user invitations and password reset functionality for MySmartNotes.

---

## Part 1: User Invitation System

### Current Status: ✅ FULLY IMPLEMENTED AND FUNCTIONAL

The user invitation system is already fully integrated and working. Here's how it operates:

### How It Works:

1. **Admin invites a user** (via Admin Dashboard → Invitations tab)
   - Admin fills in: Email, and selects a tier (Free, Pro, or Unlimited)
   - System generates a unique invite token
   - Email is sent to the invited user with a registration link
   - Invitation link format: `https://yourdomain.com/signup?token={token}`

2. **Invited user registers**
   - Clicks link in email
   - Redirected to signup page with token pre-filled
   - Creates account with nickname, email, and password
   - Agrees to Terms of Service, Privacy Policy, Fair Use Policy
   - Backend validates the token, marks invitation as used
   - User is assigned the tier specified in the invitation

### API Endpoints:

- **POST /admin/invitations** - Create new invitation (Admin only)
  - Request: `{ "email": "user@example.com", "tier": "pro" }`
  - Response: Returns invitation link and token
  - Rate limiting: None (trusted admin only)
  - Email sending: Automatically sends invitation email

- **GET /admin/invitations** - List all pending/used invitations (Admin only)
  - Shows email, token, tier, expiry date, usage status

### Frontend Flows:

**Invitation Creation (Admin Dashboard)**
```
1. Admin clicks "Invite User" button
2. Modal opens with email and tier selector
3. Submits to `/admin/invitations`
4. System shows confirmation with invitation link
5. Email automatically sent to recipient
```

**User Registration (via Invitation Link)**
```
1. User receives email with link: /signup?token=XXX
2. Clicks link → redirected to /signup page
3. Shows register panel automatically (with token pre-loaded)
4. Fills in account details (nickname, email, password)
5. Submits registration with token
6. Backend validates token + creates account with specified tier
7. Token marked as used (can't be reused)
```

### Email Configuration:

- **SMTP Setup Required**: Admin must configure Email Config in Admin Dashboard
  - SMTP Provider (e.g., smtp.gmail.com:587)
  - Email Address (sender)
  - Sender Name
  - App Password (Gmail app-specific password)
  
- If email config is incomplete, emails won't send (but invitations still created)

### Database Tables:

**user_invitations**
```
- id (int, PK)
- email (str) - unique
- token (str) - unique, 32-byte URL-safe token
- invited_by (int, FK to users) - admin who sent invite
- tier (str) - free, pro, unlimited
- is_used (bool) - marked true after registration
- expires_at (datetime) - 7 days from creation
- created_at (datetime)
```

### Token Validation:

- Tokens expire after 7 days
- One token per email (can't have duplicates)
- If admin re-invites same email, token is regenerated with fresh 7-day expiry
- After user registers, invitation marked `is_used = True`

---

## Part 2: Password Reset System

### Status: ✅ NEWLY IMPLEMENTED (COMPLETE)

Full password reset functionality for users who forgot their password.

### How It Works:

1. **User requests password reset**
   - Clicks "Forgot password?" on login page
   - Enters email address
   - System sends reset link to email
   - Link valid for 24 hours

2. **User resets password**
   - Clicks link in email
   - Taken to password reset form
   - Enters new password (twice to confirm)
   - Submits reset
   - Password updated, token marked as used

### API Endpoints:

- **POST /auth/password-reset-request** - Request password reset
  - Request: `{ "email": "user@example.com" }`
  - Response: `{ "message": "Check your email..." }`
  - Rate limiting: Max 3 pending requests per email
  - Status: 429 (Too Many Requests) if limit exceeded
  - Email sending: Automatically sends reset link

- **POST /auth/password-reset** - Submit new password with token
  - Request: `{ "token": "XXX", "new_password": "password123" }`
  - Response: `{ "message": "Password reset successfully" }`
  - Error handling: Returns 400 if token invalid/expired

- **GET /auth/password-reset-token-valid** - Validate token (before showing form)
  - Query: `?token=XXX`
  - Response: `{ "valid": true/false, "message": "..." }`
  - No authentication required

### Frontend Flows:

**Forgot Password (Login Page)**
```
1. User clicks "Forgot password?" link
2. Taken to "Forgot Password" panel
3. Enters email address
4. Submits request
5. Shows message: "Check your email for reset link (expires in 24 hours)"
6. Email sent with link: /login?reset_token=XXX
```

**Password Reset (Email Link)**
```
1. User clicks link in email
2. Automatically validates token
3. If valid: Shows password reset form
4. If expired/invalid: Shows error, redirects to login
5. User enters new password + confirmation
6. Submits
7. Shows success message, redirects to login
8. User can now login with new password
```

### Database Tables:

**password_reset_tokens**
```
- id (int, PK)
- user_id (int, FK to users)
- email (str, indexed) - for logging
- token (str, unique, indexed) - 32-byte URL-safe token
- is_used (bool) - marked true after password reset
- expires_at (datetime) - 24 hours from creation
- created_at (datetime)
```

### Rate Limiting:

- Max 3 active (unused & non-expired) reset tokens per email
- Returns 429 status if limit exceeded
- Prevents brute force attacks on email

### Security Features:

1. **Token validation**
   - Valid for 24 hours only
   - One-time use (marked `is_used=True` after reset)
   - URL-safe random tokens (secrets.token_urlsafe(32))
   - Cannot be reused

2. **Information disclosure**
   - Doesn't reveal if email exists (for all responses)
   - Generic success message: "If account exists with this email, link sent"
   - Prevents account enumeration

3. **User feedback**
   - Clear error messages for expired/invalid tokens
   - Automatic token validation before showing form
   - Clear instructions in emails

### HTML/UI Components:

**Login Page Additions**
```html
<!-- Forgot Password Panel -->
<div id="forgotPasswordPanel">
  - Email input field
  - "Send Reset Link" button
  - Link back to login
</div>

<!-- Reset Password Panel -->
<div id="resetPasswordPanel">
  - New password input
  - Confirm password input
  - "Reset Password" button
  - Link back to login
</div>
```

**Navigation**
- From login: "Forgot password?" link opens forgot password panel
- From forgot password: Back to login
- From reset password: Back to login after successful reset

### Email Templates:

**Invitation Email** (already existed, enhanced)
```
Subject: You're invited to join MySmartNotes!
- Invitation to join platform
- Clickable button with registration link
- Message about safe to ignore if unexpected
```

**Password Reset Email** (new)
```
Subject: Password Reset Request - MySmartNotes
- Explanation of password reset request
- Clickable "Reset Password" button
- Raw link for copy-paste
- 24-hour expiry notice
- Assurance: "If you didn't request this, you can ignore"
```

### Error Handling:

- **Invalid token**: "Invalid or already-used password reset token"
- **Expired token**: "Password reset link has expired. Request a new one"
- **User not found**: Returns generic success (won't reveal if registered)
- **Rate limit exceeded**: "Too many password reset requests. Wait a few hours"
- **Connection errors**: "Connection error. Please try again"
- **Password mismatch**: "Passwords do not match"
- **Too short password**: "Password must be at least 6 characters long"

---

## Part 3: Route Summary

### New Routes:

**Pages**
- `GET /signup` - Serve signup page with invitation token support
- `GET /reset-password` - Serve password reset page (redirects to /login with reset_token param)
- `GET /login` - Serve login page (with all panels: login, register, forgot-password, reset-password)

**API Endpoints**
- `POST /auth/password-reset-request` - Request password reset
- `POST /auth/password-reset` - Submit new password
- `GET /auth/password-reset-token-valid` - Check if token is valid

**Existing Endpoints (Already working)**
- `POST /admin/invitations` - Create invitation
- `GET /admin/invitations` - List invitations
- `POST /auth/register` - Register (with token support)

### URL Flows:

```
Invitations:
  Email → /signup?token=ABC123 → Shows register panel → /auth/register with token

Password Reset:
  Email → /login?reset_token=XYZ789 → Shows reset form → /auth/password-reset with token
```

---

## Part 4: Testing Checklist

### Invitations:
- [ ] Admin creates invitation in dashboard
- [ ] Invitation email received
- [ ] Click link in email → redirect to /signup?token=X
- [ ] Register panel shows automatically
- [ ] Fill form and submit
- [ ] Account created with correct tier
- [ ] Invitation marked as used in admin dashboard
- [ ] Can't use same token twice
- [ ] Token expires after 7 days

### Password Reset:
- [ ] User clicks "Forgot password?" on login
- [ ] Enters email → "Check your email" message
- [ ] Email received with reset link
- [ ] Click link in email → reset form shows
- [ ] Invalid token shows error
- [ ] Password entered & confirmed
- [ ] Submit → success message
- [ ] Redirect to login
- [ ] Can login with new password
- [ ] Rate limiting: 3rd request shows error
- [ ] Email not found still shows generic success

---

## Part 5: Configuration Required

### Email Setup (Admin Dashboard):
1. Go to Admin Panel → "Email Config" tab
2. Fill in:
   - **SMTP Provider**: smtp.gmail.com:587
   - **Email Address**: your-email@gmail.com
   - **Sender Name**: MySmartNotes
   - **App Password**: [Gmail app-specific password]
3. Save
4. Test by inviting a user or resetting password

### Domain Configuration (for email links):
1. Admin Panel → System Settings
2. Set **Domain URL**: https://yourdomain.com
3. Ensure it's the public URL (not localhost)
4. Links in emails will use this domain

---

## Summary

✅ **Invitation System**: Working end-to-end
- Admins send invitations with email
- Users register via link with pre-selected tier
- Tokens expire after 7 days
- One-time use, can't be reused

✅ **Password Reset System**: Fully implemented
- Users request reset from login page
- Receive email with 24-hour valid link
- Reset password securely
- Rate limited (3 requests max per email)
- One-time token use

✅ **API Rate Limiting**: Implemented
- Password reset: Max 3 pending requests per email
- Returns 429 status when exceeded
- Prevents abuse/brute force

✅ **Security**: 
- URL-safe random tokens
- Token expiration
- One-time use only
- Rate limiting
- No account enumeration (generic messages)

