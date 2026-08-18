# AIko email identities

AIko uses two public email identities under `zetbros.com`, with separate responsibilities.

## Human support

- Address: `support.aiko@zetbros.com`
- Use for: learner questions, technical issues, privacy requests, account-access help, and replies that need a person.
- This is the address exposed in AIko's Support, Privacy, and Terms surfaces.

## Automated account mail

- Address: `account.aiko@zetbros.com`
- Sender name: `AIko Accounts`
- Use for: signup confirmation, password recovery/reset, email-change/security notices, and other automated authentication mail.
- Do not present this address as the support/contact destination. Authentication email templates should direct users who need help to `support.aiko@zetbros.com`.

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

`account.aiko@zetbros.com` is an alias, so it is used as the visible sender address while SMTP authentication continues to use the real mailbox. Spacemail aliases can send and receive mail but cannot be used to log in to the mailbox.

The Supabase Site URL and authentication redirect allow-list remain restricted to `https://aiko.zetbros.com`.
