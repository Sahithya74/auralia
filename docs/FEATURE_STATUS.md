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
| Real AI conversation (Google Gemini 3.8 Flash) | works end to end in the app. Measured first text 13–18 s at the time of testing because Google returned "high demand" 503s that the server retried; replies followed the conversation rules in English and spoken Tamil |
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
- Voice output sentence by sentence while the reply streams; stop, replay, interrupt by tapping the mic.
- Animated companion: breathing (idle), ripples (listening), slow pulse (thinking), movement during speech that also pulses on word boundaries where the browser reports them. Static under reduced motion.
- Optional reflection after ending: summary, small next steps to choose from, and memory suggestions she selects explicitly.

**Privacy**
- Three memory modes plus optional history, enforced server-side in one transactional gate with a build-time architecture test.
- Privacy Centre: change mode (with deletion confirmation), history toggle and bulk delete, memory management (edit, disable, delete, add), analytics consent switch, export, account deletion, plain-language explanations including honest limits.
- Logs redact content, credentials and contact details.

**AI and safety**
- Provider interface with Anthropic (streaming, abort, typed error mapping, server-side refusal fallback) and Google Gemini (streaming, abort, blocked-reply detection, retry with back-off and a fallback model when overloaded) implementations, plus a clearly labelled development mock.
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
| Reply latency with Gemini | Depends on Google's load for the key's tier; first text took 13–18 s during testing. | Retries and fallback model avoid failures, not delays; a paid tier or Anthropic would be faster. |
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
