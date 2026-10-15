# Feature status

An honest account of what works, what is partial, and what is planned. "Verified" means covered by automated tests or exercised in this environment; anything else says how it was (or wasn't) checked.

Last updated: 2026-10-14.

## Verification so far

| Check | Result |
|---|---|
| Server TypeScript type-check | passes |
| Server unit tests (crisis screening in 6 languages, prompts, privacy architecture guard, policy matrix, mock provider, validation, language sync) | passing |
| Server integration tests against MariaDB 10.4 (auth, data isolation, memory-mode enforcement incl. cancelled streams, chat streaming, account deletion, rate limits) | 35 passing |
| Client type-check and production build (Vite + service worker) | passes |
| Client tests (SSE parsing, speech helpers, voice fallback, privacy-mode storage, safety card, stop/retry, end flow, translation parity for all 6 languages, axe accessibility on welcome/sign-in/register) | 27 passing |
| Database migration | applied to a live MariaDB (XAMPP, port 3307); demo account seeded |
| Real AI conversation (Google Gemini 3.5 Flash-Lite) | works end to end in the app. Measured first text 1.2–1.7 s and full spoken-length replies in under 2 s (English, Tamil, Hindi); replies followed the conversation rules |
| Real Anthropic API conversation | not run — no Anthropic key configured. The provider follows the official SDK and type-checks |
| UI vs Stitch designs | Home, Voice, Text and Privacy screens rendered in headless Edge at 390×844 and compared with the Stitch screenshots |
| Real voice input/output in each language | **not yet run** — needs a real browser, microphone and device (checklist §1–2) |

## Implemented

**Accounts and security**
- Registration, sign-in, sign-out, password reset by emailed single-use link (console output in development), session restore after reload.
- bcrypt password hashing; 15-minute JWT access tokens held in memory; rotating `httpOnly` refresh cookies stored as hashes, with reuse detection.
- Zod validation on every endpoint, rate limits, Helmet headers, CSRF header check on cookie endpoints, generic error messages, ownership-scoped queries (other users' data returns 404).
- Account export (JSON) and deletion with password confirmation (cascading).

**Onboarding and settings**
- Five-step onboarding: language, voice/text preference, memory mode, conversation style, AI disclaimer. Skippable to the disclaimer.
- Settings: language and code-mixing, voice replies, speaking speed, voice test, review-before-send, response style, text size, reduced motion, higher contrast, captions, gentle daily prompt, name, sign out, response timing display.

**Conversation**
- Streaming replies (SSE) with thinking / streaming / done states, stop button, cancellation that stores nothing, retry, duplicate-submission protection, offline detection, timeouts.
- Optional mood check-in passed to the companion.
- Language switch mid-conversation without restarting.
- Voice input via the Web Speech API with live captions, permission/no-speech/network error messages, and "correct what I said" which replaces the last exchange.
- Live voice conversation: one tap starts it, then Anbu greets her and the turns flow on their own (listen → reply spoken aloud → listen again) with no more tapping. Replies in a live conversation are kept short and spoken-style. Tapping while Anbu speaks hands the turn back to her; the same button pauses. The screen stays on during a live conversation so the phone does not lock mid-talk. It pauses itself after about 40 seconds of silence or on an error, and says so. If she leaves the page the microphone turns off, and the conversation carries on by itself when she comes back within 10 minutes.
- Anbu speaks with a woman's voice by default; a man's voice can be chosen in Settings. It applies to the natural voice and to device voices (a device voice of the other gender is never used).
- A built-in neural device voice of the chosen gender (Edge "Online (Natural)" voices, Apple enhanced voices) is used first: it is natural-sounding, starts while the reply is still arriving and has no daily limit.
- Otherwise a natural, human-sounding voice for replies in all six languages (Gemini text-to-speech, streamed so playback starts as audio arrives; measured 1.1–3 s to first sound). Falls back to the device voice when the natural voice is busy or the audio arrives slower than it plays (with no device voice for the language, it downloads the whole reply first and plays it without gaps), and prefers the device's most natural-sounding voice. Stop and replay.
- Patient listening in a live conversation: short pauses don't cut her off; her turn ends after about 1.5 s of silence, and words still being recognised are kept.
- A dropped connection or busy moment mid-conversation is retried once automatically before the conversation pauses; going offline pauses it.
- Animated companion: breathing (idle), ripples (listening), slow pulse (thinking), movement during speech that also pulses on word boundaries where the browser reports them. Static under reduced motion.
- Optional reflection after ending: summary, small next steps to choose from, and memory suggestions she selects explicitly.

**Privacy**
- Three memory modes plus optional history, enforced server-side in one transactional gate with a build-time architecture test.
- Privacy Centre: change mode (with deletion confirmation), history toggle and bulk delete, memory management (edit, disable, delete, add), analytics consent switch, export, account deletion, plain-language explanations including honest limits.
- Logs redact content, credentials and contact details.

**AI and safety**
- Provider interface with Anthropic (streaming, abort, typed error mapping, server-side refusal fallback) and Google Gemini (streaming, abort, blocked-reply detection, a fallback model raced in when the main one is slow and used straight away when it is overloaded) implementations, plus a clearly labelled development mock.
- Companion prompt encoding the conversation rules, language enforcement, response style and memory handling (stated vs. unverified items, fenced as data).
- Crisis screening before every model call (English, Tamil, Hindi, Malayalam, Kannada, Telugu, plus romanisations), separate safety prompt, helpline card, static fallback message in all six languages.

**Languages:** full UI translations for English, Tamil, Hindi, Malayalam, Kannada and Telugu, lazy-loaded; adding a language is one entry on each side plus a locale file (tests check they stay in sync).

**PWA:** manifest, generated icons, service worker caching only the app shell, update prompt.

## Partial or limited

| Area | Limitation | Handling |
|---|---|---|
| Voice in Indian languages | Depends on the browser and device. Chrome generally recognises ta/hi/ml/kn/te; many Windows machines have no voices for them; Firefox has no speech recognition; iOS support is limited. | Per-language detection, clear messages, text always available. |
| Speaking animation sync | Browsers don't expose speech-synthesis audio levels. | Animation follows playback state and word-boundary events when the voice provides them. |
| Reply language | Enforced by strong prompt instructions, not a hard guarantee. | Tested prompt rules; consider a script-detection check later. |
| Reply latency with Gemini | Depends on Google's load for the key's tier. With Flash-Lite and minimal thinking, first text took 1.2–1.7 s in testing (it was 13–18 s with Gemini 3.8 Flash). | Flash-Lite trades some depth for speed; set `GEMINI_MODEL` to a larger model if replies feel too simple. |
| Natural voice quota | Free-tier keys allow 3 speech requests per minute and **10 per day** per model (about 30–40 spoken replies a day across the rotated models). Past that, replies use the device voice, or are text only if the device has no voice of the chosen gender for the language (e.g. Tamil in Chrome on Windows). The slow backup model can take 8–36 s, so it is used only when there is no device voice. | Enable billing on the Gemini key, or use Microsoft Edge (free natural voices in all six languages) or an Android phone. |
| Live voice turn-taking | Listening restarts only after Anbu finishes speaking, so she cannot cut in by voice, only by tapping. On Android, Chrome decides when she has finished a sentence, so long pauses mid-thought may send early. | Browser speech recognition has no echo cancellation for the app's own speech, so listening during speech would hear Anbu. |
| Stitch design fidelity | A few elements differ on purpose: honest privacy wording, deeper terracotta on text buttons for contrast, no "bookmark" or audio duration on replies (the app has no data for them). | Documented in the README "Design source" section. |
| Crisis screening | Keyword/pattern heuristic; can miss indirect expressions and occasionally over-trigger. | The companion prompt carries safety rules as a backstop; phrase lists need review by native speakers and clinicians. |
| Translations and static safety messages | Drafted by the developer. | **Must be reviewed by native speakers** before public release. |
| Rate limiting | In-memory counters, per server instance. | Use a shared store (Redis) when running more than one instance. |
| Message encryption at rest | Relies on database/storage encryption; no application-level encryption of stored conversations. | Disclosed in the Privacy Centre. |
| Notifications | Only the in-app daily card; no push notifications (intentionally — no guilt-inducing reminders). | — |
| Analytics | Consent switch only; nothing is collected. | — |

## Planned / not implemented

- Server-side speech providers (e.g. cloud STT/TTS) behind the same voice interface, for devices without Indian-language voices.
- Email verification on registration; changing email/password from Settings (currently via reset link).
- Per-language reply-language verification and automatic correction.
- A classifier-based (rather than pattern-based) safety screen, reviewed with mental-health professionals.
- Region-specific helpline sets beyond India.
- End-to-end browser tests (Playwright) for the full voice and PWA flows.
- Admin/ops tooling: log retention configuration, metrics dashboard for the latency events already logged (`chat.completed`).
