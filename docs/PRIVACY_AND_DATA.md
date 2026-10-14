# Privacy and data handling

This describes what Anbu stores, where, for how long, and what is shared with other services. It is written to be accurate, not reassuring: **no online service can guarantee absolute privacy.**

## What each memory mode does

| | No memory | Session only | Personal memory | Personal + history |
|---|---|---|---|---|
| Conversation text on the server | never | never | never | yes, until she deletes it |
| Saved memories | not allowed | not allowed | only items she approves | only items she approves |
| Conversation context in the browser | page memory only (lost on reload) | `sessionStorage` for this tab | `sessionStorage` for this tab | `sessionStorage` for this tab |
| Context sent to the AI provider with each message | recent turns of this conversation | recent turns | recent turns + enabled memories | recent turns + enabled memories |

- Default for new accounts: **Session only**, history off.
- Ending a conversation, signing out, or closing the tab clears the browser copy.
- Switching to a stricter mode (e.g. Personal → No memory, or turning history off) **deletes** the affected stored data, after she confirms.

## How "No memory" is enforced (not just promised)

1. **One write path.** Only `server/src/persistence/memoryGate.ts` may create or update `Conversation`, `Message` or `Memory` rows. Each write re-reads the user's mode **inside the same database transaction** and stores nothing unless the mode allows it. Calling the API directly cannot bypass this.
2. **Build-time guard.** `server/tests/unit/architecture.test.ts` fails if any other source file calls `create/update/upsert` on those models, uses nested writes to them, or runs raw SQL writes.
3. **Integration tests** (`tests/integration/memoryMode.test.ts`) assert zero stored rows for No-memory and Session users across normal replies, failures, corrections, both chat endpoints, and replies cancelled mid-stream.
4. **Logs** (`server/src/utils/logger.ts`) are structured events; keys that could hold content, contact details or credentials are redacted. Request bodies and query strings are never logged. Prisma query logging is off.
5. **No background jobs or analytics** touch conversation content. The analytics consent switch exists for the future; nothing is collected today.

## What is always stored

| Data | Why | Retention |
|---|---|---|
| Name, email, bcrypt password hash | account and sign-in | until account deletion |
| Language, interaction mode, memory mode, preferences | the app's settings | until account deletion |
| Refresh-token hashes (SHA-256), with expiry | keeping her signed in, detecting stolen tokens | expired tokens and tokens revoked over 1 day ago are deleted at each sign-in; all deleted with the account |
| Password-reset token hashes | single-use reset links (30 min) | replaced on each request; deleted with the account |
| Timestamps (`createdAt`, `updatedAt`) | integrity, ordering | with the row |

**Operational metadata in server logs:** request method, path, status, duration, user id (an opaque random id), and chat timing (provider, model, language, safety level, milliseconds, reply length in characters). No message text. Log retention depends on where you host — set a short retention (e.g. 14 days) in production.

**Rate-limit counters** are kept in server memory for up to an hour, keyed by IP address or user id.

## What leaves the server

| Recipient | What | When |
|---|---|---|
| AI provider (Google Gemini or Anthropic, per `AI_PROVIDER`) | system instructions, her display name, mood check-in, enabled memories (Personal mode), recent conversation turns | every reply and reflection |
| Browser speech service (Chrome/Edge vendors) | microphone audio | only while she is using voice input |
| Email provider (SMTP) | her email address and a reset link | only for password resets |

Configure the AI provider account for the shortest retention available (e.g. zero-data-retention arrangements where your organisation qualifies) and review its data policy. Text-to-speech uses voices installed on her device; some browsers may use online voices.

## Account deletion and export

- **Export** (`POST /api/account/export`) returns all account data, preferences, memories and stored conversations as JSON.
- **Deletion** (`DELETE /api/account`, password required) removes the user row; foreign keys cascade to preferences, conversations, messages, memories and tokens in the same statement. An access token already issued stays cryptographically valid for at most 15 minutes but finds no data.
- Database **backups** made before a deletion may still contain the data until they expire — set a backup retention policy and document it for users.

## Encryption

- In transit: HTTPS is required in production (secure cookies, microphone access and PWA install all depend on it). The server uses Helmet's security headers.
- At rest: use a MySQL deployment with storage encryption (most managed services enable this by default). Passwords are bcrypt-hashed; tokens are SHA-256 hashed.
- Not implemented: application-level encryption of message content. With history on, an operator with database access can read stored conversations. This is stated in the app's Privacy Centre under "Honest limits".

## Shared devices

The access token lives only in page memory; the refresh cookie is `httpOnly`. Anyone who can unlock her phone could still open the app while she is signed in. The safety card reminds her that ending a conversation clears it from the screen.
