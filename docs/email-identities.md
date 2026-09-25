# AIko email identities

AIko uses two public email identities under `zetbros.com`, with separate responsibilities.

## Human support

- Address: `support.aiko@zetbros.com`
- Use for: learner questions, technical issues, privacy requests, account-access help, and replies that need a person.
- This is the address exposed in AIko's Support, Privacy, Terms, and automated account-email help text.
- Incoming support mail reaches the real `admin@zetbros.com` Spacemail mailbox through the alias.

## Automated account mail

- Address: `account.aiko@zetbros.com`
- Sender name: `AIko Accounts`
- Use for: signup confirmation, password recovery/reset, email-change/security notices, and other automated authentication mail.
- Do not present this address as the support/contact destination.
- Authentication email templates direct users who need help to `support.aiko@zetbros.com`.
- Replies to `account.aiko@zetbros.com` are intentionally discarded by the Spacemail `No-reply` filter. They are not forwarded to support and should not consume mailbox storage.

## Password recovery

AIko password recovery is code-based rather than link-based:

1. The learner submits their email on `/forgot-password`.
2. Supabase Auth sends a 6-digit recovery code from `AIko Accounts <account.aiko@zetbros.com>`.
3. AIko moves the learner to `/reset-password` and displays a 5-minute countdown.
4. The learner enters the code; AIko verifies it with Supabase Auth as a `recovery` OTP.
5. Incorrect codes are rejected. Expired codes require a new recovery request.
6. After successful verification, the learner can choose a new password.
7. The temporary recovery session is signed out after the password is changed, and the learner returns to normal sign-in.

The Supabase email OTP lifetime is configured as 300 seconds and the OTP length as 6 digits. The recovery email template is versioned at `supabase/templates/recovery.html` and contains `{{ .Token }}` rather than a reset link.

## Supabase Auth custom SMTP

Production authentication email is sent by Supabase Auth, so the sender identity is configured in **Supabase Dashboard → Authentication → Custom SMTP**, not in the browser application.

Spacemail configuration for the current mailbox:

- SMTP host: `mail.spacemail.com`
- SMTP port: `465`
- Encryption: SSL/TLS
- SMTP username: the real Spacemail mailbox, `admin@zetbros.com`
- SMTP password: the password for that mailbox; never commit it to Git
- Sender email / From address: `account.aiko@zetbros.com`
- Sender name: `AIko Accounts`

`account.aiko@zetbros.com` is an alias, so it is used as the visible sender address while SMTP authentication continues to use the real mailbox. The mailbox filter discards incoming replies addressed to the account alias; support mail remains separate.

The Supabase Site URL and authentication redirect allow-list remain restricted to `https://aiko.zetbros.com`.
