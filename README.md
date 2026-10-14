# Anbu — an AI companion who listens

Anbu is a mobile-first, installable web app (PWA) where mothers and women can talk — by voice or text, in **English, Tamil, Hindi, Malayalam, Kannada or Telugu** — with a warm, honest AI companion whenever they need someone to listen.

It is **not** a medical or counselling service, and it says so. It is designed to help people feel heard and more able to handle real life, and to encourage connection with real people rather than dependence on the app.

| | |
|---|---|
| **Client** | React 19 + TypeScript, Vite 8, Tailwind CSS 4, Framer Motion, react-i18next, vite-plugin-pwa |
| **Server** | Node.js + Express 5 + TypeScript, Zod validation, JWT + rotating refresh cookies, bcrypt, express-rate-limit, Helmet |
| **Database** | MySQL 8 via Prisma 6 |
| **AI** | Provider interface with Anthropic Claude (`claude-opus-5-5`) and Google Gemini (`gemini-3.5-flash-lite`, currently configured); streamed over SSE |
| **Voice** | Browser Web Speech API (speech recognition + speech synthesis), detected per language with text fallback |
| **Design** | "Warm Sanctuary" design system from the Stitch project *Anbu Emotional Companion App*: Newsreader + Plus Jakarta Sans (self-hosted), Material Symbols icons (embedded SVG), Material 3 warm palette |

See [docs/FEATURE_STATUS.md](docs/FEATURE_STATUS.md) for an honest list of what is implemented, partial, and planned, and [docs/API.md](docs/API.md) for the REST API.

---

## 1. Requirements (Windows)

| Software | Version | Notes |
|---|---|---|
| Node.js | 20.19+ (24 LTS recommended) | <https://nodejs.org> — includes npm |
| MySQL Server | 8.0+ | MySQL Installer for Windows, or XAMPP's MySQL/MariaDB |
| Git | any | optional, for version control |
| Browser | Chrome or Edge | needed for voice input; any modern browser works for text |
| Anthropic API key | — | from the Anthropic Console, for real AI replies (paid usage) |

> **Tip — OneDrive:** this project currently lives in a OneDrive-synced folder. Syncing `node_modules` (hundreds of MB) makes installs, tests and builds very slow. If you can, move the project to a non-synced folder such as `C:\dev\anbu`, or exclude `node_modules` from OneDrive.

## 2. Set up MySQL

1. Start the MySQL service: open **Services** (`Win + R` → `services.msc`), find **MySQL80**, click **Start** (or set it to *Automatic*). From an *administrator* PowerShell: `Start-Service MySQL80`.
2. Create the databases and a dedicated user. Open **MySQL 8.0 Command Line Client** (or MySQL Workbench) as `root` and run:

```sql
CREATE DATABASE anbu CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE DATABASE anbu_test CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'anbu'@'localhost' IDENTIFIED BY 'choose-a-strong-password';
GRANT ALL PRIVILEGES ON anbu.* TO 'anbu'@'localhost';
GRANT ALL PRIVILEGES ON anbu_test.* TO 'anbu'@'localhost';
FLUSH PRIVILEGES;
```

Only if you will **change the schema** later (`npm run db:migrate`), Prisma also needs to create a temporary "shadow" database: `GRANT CREATE, ALTER, DROP, REFERENCES ON *.* TO 'anbu'@'localhost';`

`utf8mb4` is required: Tamil, Malayalam, Kannada, Telugu and Devanagari text must be stored correctly.

**Using XAMPP instead (no admin rights needed):** XAMPP's MariaDB works too (tested with 10.4). Start MySQL from the XAMPP Control Panel. XAMPP runs it on **port 3307** by default and `root` has no password, so connect with `C:\xampp\mysql\bin\mysql.exe -h 127.0.0.1 -P 3307 -u root`, run the SQL above, and use port `3307` in `DATABASE_URL`. This machine's current `server/.env` is set up this way.

## 3. Configure the server

```powershell
cd server
copy .env.example .env
```

Edit `server/.env`:

| Variable | What to set |
|---|---|
| `DATABASE_URL` | `mysql://anbu:YOUR_PASSWORD@localhost:3306/anbu` (URL-encode special characters, e.g. `@` → `%40`) |
| `TEST_DATABASE_URL` | `mysql://anbu:YOUR_PASSWORD@localhost:3306/anbu_test` — **wiped by the tests**; its name must contain `test` |
| `JWT_ACCESS_SECRET` | a long random string: `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `AI_PROVIDER` | `anthropic` or `gemini` for real replies, or `mock` for clearly-labelled placeholder replies while developing |
| `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `AI_EFFORT` | Claude settings (model defaults to `claude-opus-5-5`; effort `low` is fastest) |
| `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_FALLBACK_MODELS`, `GEMINI_THINKING_LEVEL` | Gemini settings (defaults: `gemini-3.5-flash-lite`, fallback `gemini-flash-lite-latest`, thinking `minimal`). Each model may carry its own thinking level, e.g. `gemini-3.8-flash:low` (minimal thinking only works on Flash-Lite models). |
| `GEMINI_HEDGE_MS` | If the main model has sent no text after this many milliseconds (default 2500), the fallback model is started too and whichever answers first is used; the other is cancelled. Overloaded or rate-limited models are skipped straight away. |
| `NATURAL_VOICE`, `GEMINI_TTS_MODELS`, `GEMINI_TTS_VOICE`, `GEMINI_TTS_FIRST_AUDIO_MS` | Anbu's natural spoken voice (Gemini text-to-speech, needs `GEMINI_API_KEY`). Free-tier keys allow about 3 speech requests per minute **per model**, so the models are rotated; one that hits its quota rests until Google allows it again, and one that has produced no audio after `GEMINI_TTS_FIRST_AUDIO_MS` (default 3500) is skipped. When none is available the app uses the device's own voice. Defaults: voice `Sulafat`, models `gemini-3.8-flash-lite-tts,gemini-3.8-flash-tts,gemini-3.1-flash-tts-preview`. |

Keys live only in `server/.env` — never in client code.
| `MAIL_TRANSPORT` | `console` prints password-reset links in the server terminal (development only); `smtp` sends real email (fill `SMTP_*`) |

Never commit `.env` — it is git-ignored.

## 4. Install, migrate, run

From the project root (`AURALIA/`):

```powershell
npm install                 # installs client + server (npm workspaces)
npm run db:deploy           # creates the tables from prisma/migrations
npm run db:seed             # optional: one clearly fictional demo user
npm run dev                 # starts API on :4000 and web app on :5173
```

Open <http://localhost:5173>. The web app proxies `/api` to the server, so cookies and streaming work on one origin.

> If `npm install` warns that install scripts were blocked, run `npm approve-scripts @prisma/client prisma @prisma/engines esbuild` once (already recorded in `package.json` → `allowScripts`).

Seed account (fictional): `demo@anbu.example` / `demo-password-123`.

### Useful commands

| Command | Purpose |
|---|---|
| `npm run dev` | API + web app with reload |
| `npm test` | server tests, then client tests |
| `npm run test -w server` | server unit tests; integration tests run when `TEST_DATABASE_URL` is set |
| `npm run typecheck` | TypeScript checks for both packages |
| `npm run db:migrate` | after editing `schema.prisma`: create and apply a new migration |
| `npm run db:studio -w server` | browse the database (Prisma Studio) |
| `npm run icons -w client` | regenerate PWA icons from `client/public/favicon.svg` |

### Design source (Google Stitch MCP)

The UI follows the Stitch project **Anbu Emotional Companion App** (screens: Home Sanctuary, Voice Conversation, Text Conversation, Privacy & Memory Centre; design system "Warm Sanctuary"). The Stitch MCP server is registered for Claude Code at *local* scope (stored in your user config, not this repository):

```powershell
claude mcp add --transport http stitch https://stitch.googleapis.com/mcp --header "X-Goog-Api-Key: YOUR_STITCH_KEY" -s local
claude mcp get stitch     # shows "Connected"
```

Design tokens are in `client/src/styles/index.css`; icons are Material Symbols paths in `client/src/components/ui/Icons.tsx`; images from the designs are in `client/public/images/`. Where the design's sample copy made privacy claims the app can't keep (e.g. "each sentence stands on its own", "stays between you and the quiet air"), accurate wording is used instead, and text buttons use a slightly deeper terracotta (`primary-strong`) so white labels meet WCAG AA contrast.

## 5. Production build

```powershell
npm run build                       # builds server (dist/) and client (client/dist/)
npm run db:deploy                   # applies migrations without prompts
set NODE_ENV=production
npm start                           # Express serves the API and the built PWA on PORT
```

Production checklist:

- **HTTPS is required** — for secure cookies, microphone access and PWA installation. Put the server behind a TLS-terminating proxy (Nginx, Caddy, a PaaS load balancer) and set `TRUST_PROXY=1`.
- Set `NODE_ENV=production`, `CLIENT_ORIGIN` and `APP_BASE_URL` to your https URL, a fresh `JWT_ACCESS_SECRET`, and real SMTP settings.
- `AI_PROVIDER=mock` is refused in production.
- Health check: `GET /api/health` → `200 {"status":"ok"}` (or `503` if the database is unreachable).
- Use a managed MySQL with encryption at rest and automated backups; restrict DB network access to the app.
- The rate limiter stores counters in memory. With more than one server instance, move it to a shared store (e.g. Redis).

## 6. Installing the app on a phone (PWA)

The app must be served over **https** (or `localhost`).

- **Android (Chrome):** open the site → menu ⋮ → **Install app** / **Add to Home screen**.
- **iPhone (Safari):** open the site → Share → **Add to Home Screen**. (Voice input in iOS browsers is limited — see Feature status.)
- **Desktop (Chrome/Edge):** click the install icon in the address bar.

The service worker caches only the app shell. Conversations and API responses are **never** cached.

### Sharing a temporary public link (any Wi-Fi or mobile data)

To let someone open the app from another network without deploying it, run a production instance on this PC and expose it through an HTTPS tunnel. HTTPS also lets phones use the microphone.

```powershell
# 1. Build the latest client
npm run build -w client

# 2. Run a production instance on its own port (dev servers can keep running).
#    Settings passed on the command line override server/.env.
cd server
$env:NODE_ENV="production"; $env:PORT="4200"; $env:TRUST_PROXY="1"; $env:COOKIE_SECURE="true"
npx tsx src/index.ts
```

Then, in a second terminal, open a tunnel to port 4200:

| Tunnel | Command | Notes |
|---|---|---|
| **Pinggy** (works on networks that only allow HTTPS/port 443) | `ssh -p 443 -R0:localhost:4200 free.pinggy.io` (press Enter if asked for a password, or add `-i <any ssh key>`) | No account. Prints two `https://…` links. Free links expire after **60 minutes** and include your public IP in the address. |
| **Cloudflare quick tunnel** | `cloudflared tunnel --protocol http2 --url http://localhost:4200` | No account. Needs outbound port **7844**; some campus/office networks block it (you'll see `connection refused` on 7844). |
| **ngrok** | `ngrok http 4200` | Free account and auth token required; free plan includes one fixed domain. |

Free tunnels drop now and then. To have Pinggy reconnect by itself, run it in a loop (each reconnect prints a **new** address):

```bash
while true; do ssh -p 443 -o ServerAliveInterval=15 -R0:localhost:4200 free.pinggy.io; sleep 3; done
```

The link works only while this PC is on, online, and both terminals keep running. Anyone with the link can create an account and chat, which uses your AI provider key (rate limits apply). For a permanent link, deploy the server (with a hosted MySQL) to a host such as Render or Railway, following the production checklist above.

## 7. Voice and languages — what to expect

- **Listening** uses your **browser's** speech recognition. Chrome and Edge support it (audio is processed by the browser vendor's online speech service). Firefox has no speech recognition. Tamil, Malayalam, Kannada and Telugu work in Chrome on many devices, but not all.
- **Speaking**: Anbu replies in a natural, human-sounding voice generated by Gemini on the server, in all six languages, on any device with a modern browser. If that voice is busy (free-tier quota) or the connection is very slow, the device's own voice is used when it has one for the language (often missing on Windows — add one under *Settings → Time & language → Speech*).
- In a live conversation the app listens patiently: a pause of about 1.5 seconds ends her turn (on Android, Chrome's own pause detection is used because its patient mode repeats words).
- The app detects what works and shows a clear message, falling back to text. It never fails silently.
- The AI is instructed to reply only in the selected language, with natural code-mixing (e.g. Tanglish) if enabled. This is a strong instruction, not a hard guarantee.
- UI translations were drafted by the developer and **should be reviewed by native speakers** before a public release.

## 8. Privacy design (summary)

| Mode | Conversation text on server | Saved memories | In the browser |
|---|---|---|---|
| **No memory** | never stored | none | kept only in page memory; gone on reload |
| **Session only** | never stored | none | `sessionStorage` for the open tab; cleared on *End* or tab close |
| **Personal memory** | only if "keep history" is on | only items she approves | `sessionStorage` while talking |

- All conversation/memory writes go through `server/src/persistence/memoryGate.ts`, which re-checks the user's mode inside the same database transaction. A unit test fails the build if any other file writes these tables.
- Switching to a stricter mode deletes stored data (after confirmation).
- Logs never contain message text, emails, passwords or tokens.
- Messages are sent to the configured AI provider (currently Google Gemini; Anthropic Claude is also supported) to generate replies; voice input in Chrome/Edge goes through the browser's speech service. These providers have their own data policies. **No system can promise absolute privacy**, and the app says so.

More detail: [docs/PRIVACY_AND_DATA.md](docs/PRIVACY_AND_DATA.md).

## 9. Safety design (summary)

- `server/src/ai/safety/crisisDetector.ts` screens every message (6 languages + common romanisations) **before** the model is called. It is pure and unit-tested.
- Flagged messages use a separate safety prompt (`safetyPrompt.ts`) instead of the normal persona, and the client always shows a card with Indian helplines (112, Tele-MANAS 14416, Women Helpline 181). If the AI fails at that moment, a reviewed static message is shown instead of an error.
- The normal persona also contains safety rules as a backstop, and is told not to treat everyday sadness as a crisis.
- Helpline numbers live in `server/src/ai/safety/resources.ts` — verify them before each release.

## 10. Troubleshooting

| Problem | Fix |
|---|---|
| `Invalid server configuration` on start | A required `server/.env` value is missing — the message lists which. |
| `P1001: Can't reach database server` | Start the MySQL80 service; check host/port in `DATABASE_URL`. |
| `P1000: Authentication failed` | Wrong user/password in `DATABASE_URL`; URL-encode special characters. |
| `db:migrate` fails creating a shadow database | Grant the `CREATE, ALTER, DROP, REFERENCES ON *.*` privileges shown above (only needed for schema changes). |
| Indian-language text shows as `????` | The database or tables are not `utf8mb4`; recreate the database as shown above. |
| Replies say "Development mock" | `AI_PROVIDER=mock`. Set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY`. |
| "Anbu's AI service isn't available" | Invalid/missing API key or no credit; check the server log event `chat.provider_error`. |
| Microphone button missing | The browser has no speech recognition (use Chrome/Edge), or the page isn't on https/localhost. |
| "Microphone access is blocked" | Allow the microphone in the browser's site settings (padlock icon). |
| Anbu doesn't talk back | Check `/api/health` shows `"voice":{"natural":true}` and *Settings → Read replies aloud* is on. If the natural voice is busy and the device has no voice for the language, replies are shown as text only — wait a minute or install a device voice. |
| Every message fails right after updating the code | The server is still running the old code (e.g. an old process kept the port). Stop it — on Windows `Get-NetTCPConnection -LocalPort 4200` shows the process id — and start it again. |
| Tests time out starting workers | Slow synced folder (OneDrive); move the project or re-run. |
| Gemini: "experiencing high demand" / slow first reply | Google-side load on the key's tier; the server races the fallback model after `GEMINI_HEDGE_MS`. Lower that value, try later, use a paid tier, or `AI_PROVIDER=anthropic`. |
| Prisma refuses a command "invoked by an AI agent" | Prisma blocks destructive commands run by AI coding agents unless you consent. Tests use the non-destructive `migrate deploy`; run resets yourself if needed. |
| Public link shows "Cloudflare Tunnel error 1033" | The network blocks Cloudflare's tunnel port 7844; use the Pinggy command above (port 443). |
| Public link stopped working | Free Pinggy links expire after 60 minutes, or the PC/terminal stopped; start the tunnel again for a new link. |
| `EADDRINUSE :4000` | Another process uses the port; change `PORT` (and `ANBU_API_URL` for the client proxy). |

## 11. Project structure

```
AURALIA/
├── client/                    React PWA
│   ├── public/                icons, favicon
│   └── src/
│       ├── components/        ui/, chat/, companion/ (animated presence)
│       ├── contexts/          AuthContext (session, preferences)
│       ├── hooks/             useConversation (streaming, cancel, retry), useOnline, useHealth
│       ├── lib/
│       │   ├── api/           fetch client with token refresh, SSE chat stream
│       │   ├── i18n/          languages + locales/{en,ta,hi,ml,kn,te}.json
│       │   └── voice/         capability detection, recognition, sentence-by-sentence speech
│       ├── pages/             Welcome, Auth, Onboarding, Home, Conversation, Reflection, Settings, Privacy, Memories, History
│       └── styles/            design tokens (Tailwind theme)
├── server/
│   ├── prisma/                schema.prisma, migrations/, seed.ts
│   ├── src/
│   │   ├── ai/                provider interface, Anthropic + mock providers, prompts, safety/
│   │   ├── config/            env validation, languages
│   │   ├── middleware/        auth, validation, rate limits, errors, request log
│   │   ├── modules/           auth, users, chat, conversations, memories, privacy
│   │   ├── persistence/       memoryGate (the only writer of conversation data), policy
│   │   └── services/          mailer
│   └── tests/                 unit/ (no DB) and integration/ (needs TEST_DATABASE_URL)
└── docs/                      API, feature status, privacy & data, manual test checklist
```
