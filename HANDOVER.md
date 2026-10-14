# Banjg Property — Project Handover

**Last updated**: 2026-10-14
**Repository**: [github.com/gracethecoderr/3605assessment](https://github.com/gracethecoderr/3605assessment)

---

## 1. Overview

Banjg Property is an **AI-assisted repair coordination tool** for Australian property managers. Core features:

- Manage repair requests across tenants, landlords and trades in one place
- Kanban workflow (New → Waiting → Action Needed → Scheduled → Completed)
- Unified inbox across channels (Email / SMS / Teams / Chat)
- AI assistant (DeepSeek) that analyses requests and suggests next actions
- Workspace modules: Properties, Contacts, Calendar, Analytics, Settings

---

## 2. Tech stack

| Layer | Technology |
|-------|------------|
| Framework | [TanStack Start](https://tanstack.com/start) 1.x (SSR + file-based routing) |
| UI | React 19 + TypeScript 5.8 |
| Styling | Tailwind CSS v4 + shadcn/ui (Radix UI) |
| Routing | TanStack Router (auto-generated `routeTree.gen.ts`) |
| Data fetching | TanStack Query v5 |
| Forms | React Hook Form + Zod |
| Auth | [Clerk](https://clerk.com) (`@clerk/tanstack-react-start` 1.7.x) |
| Database | [Cloudflare D1](https://developers.cloudflare.com/d1/) (SQLite) + Drizzle ORM |
| AI | DeepSeek API (`deepseek-chat` model) |
| Build | Vite 8 + Rolldown, Nitro `cloudflare-module` preset (deploys to Cloudflare Workers) |
| Testing | Vitest + Testing Library |

---

## 3. Local development

### Requirements

- Node.js >= 20
- npm (lockfile is `package-lock.json`)

### Setup

```bash
git clone https://github.com/gracethecoderr/3605assessment.git
cd 3605assessment
npm install
```

Copy the environment template and fill in real keys:

```bash
cp .env.example .env.local
# Edit .env.local and add your Clerk and DeepSeek keys
```

Initialise the local D1 database (run once, and again after any new migration; data is stored in `.wrangler/state`, which is gitignored):

```bash
npx wrangler d1 migrations apply DB --local
```

```bash
npm run dev
```

In dev mode, `src/lib/db.server.ts` reads and writes the local D1 above through wrangler's `getPlatformProxy`. Open `http://localhost:8080` (Vite's port in this project) and sign in or sign up with a real email through Clerk Email OTP.

### Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview the production build |
| `npm run test` | Run tests |
| `npm run lint` | ESLint |
| `npm run format` | Prettier |

### Environment variables

Create `.env.local` in the project root (see `.env.example`):

```env
# Clerk auth (required) — get keys from https://dashboard.clerk.com
VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxx
CLERK_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxx

# DeepSeek AI assistant (optional; the AI panel shows a notice when unset)
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# Gmail integration (optional; see section 7.5)
GOOGLE_CLIENT_ID=xxxxxxxxxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
TOKEN_ENCRYPTION_KEY=   # openssl rand -base64 32
```

**Getting Clerk keys:**
1. Sign in at [dashboard.clerk.com](https://dashboard.clerk.com)
2. Create a new application and choose "Email code" as the sign-in method
3. Copy the Publishable Key and Secret Key from the API Keys page

---

## 4. Project structure

```
src/
├── components/
│   ├── AppShell.tsx          # Global layout: sidebar, top bar, notifications, AI floating button
│   ├── AssistantPanel.tsx    # AI chat panel (calls the DeepSeek server function)
│   ├── RequestCard.tsx       # Kanban card component
│   └── ui/                   # shadcn/ui primitives (do not edit by hand)
├── db/
│   └── schema.ts             # Drizzle schema (repair_requests, request_participants, request_events, gmail_accounts, email_messages)
├── lib/
│   ├── auth.tsx              # Clerk wrapper (useAuth hook with a stable API)
│   ├── data.ts               # Seed data: RepairRequest, Column, Priority types
│   ├── db.server.ts          # getDb(): D1 access (Workers binding, or wrangler proxy in dev)
│   ├── deepseek.ts           # DeepSeek server function (TanStack Start server fn)
│   ├── gmail.server.ts       # Gmail OAuth, token encryption, mailbox sync (server only)
│   ├── gmail.functions.ts    # getInbox / syncGmail / disconnectGmail server functions
│   ├── incidents.functions.ts # Incident detail, participants, email linking, notes, AI analysis
│   ├── requests.functions.ts # listRequests / createRequest / patchRequest server functions
│   ├── workspace.tsx         # Global state context: requests, toast notifications
│   └── utils.ts              # cn() helper
├── routes/
│   ├── __root.tsx            # Root route: ClerkProvider, QueryClientProvider, SEO head
│   ├── index.tsx             # Main dashboard: stats, AI briefing, kanban
│   ├── login.tsx             # Sign-in page (Clerk <SignIn withSignUp /> component)
│   ├── inbox.tsx             # Unified inbox
│   ├── api.gmail.connect.ts  # Starts the Gmail OAuth flow
│   ├── api.gmail.callback.ts # Gmail OAuth callback
│   ├── requests.$id.tsx      # Repair request detail page
│   └── workspace.$section.tsx # Workspace (Properties / Contacts / Calendar / Analytics / Settings)
├── start.ts                  # TanStack Start instance (includes clerkMiddleware)
└── styles.css                # Tailwind global styles + design tokens
```

---

## 5. Data model

Repair requests are stored in the `repair_requests` table in Cloudflare D1 (schema: `src/db/schema.ts`, migrations: `drizzle/`), isolated per Clerk `userId`, with primary key `(user_id, id)`.

Data flow: `WorkspaceProvider` (`lib/workspace.tsx`) reads with TanStack Query → server functions (`lib/requests.functions.ts`: `listRequests` / `createRequest` / `patchRequest`) → `getDb()` in `lib/db.server.ts`. On a new user's first sign-in, `listRequests` copies the demo data from `src/lib/data.ts` into their account. Writes are optimistic; on failure the user is notified and the data is refetched.

Persisted tables: `repair_requests`, `request_participants`, `request_events`, `gmail_accounts` and `email_messages` (see sections 7.5 and 7.6). Demo inbox messages, detail-page notes, contacts and properties are still hard-coded or held in component state (see section 9).

Schema change workflow:

```bash
npx drizzle-kit generate                      # generate a new SQL migration
npx wrangler d1 migrations apply DB --local   # apply locally
npx wrangler d1 migrations apply DB --remote  # apply to the deployed database
```

Production database: `banjg-property-db`, ID `6517c9ef-deb9-4d5a-8a58-455235489aae`, binding name `DB` (see `wrangler.jsonc`).

```typescript
interface RepairRequest {
  id: string;          // "REQ-108"
  title: string;       // "Dripping kitchen tap"
  address: string;     // "3/22 Oxford St, Paddington"
  priority: "Urgent" | "High" | "Medium" | "Low";
  column: "New" | "Waiting" | "Action Needed" | "Scheduled" | "Completed";
  status: string;      // Current status description
  waitingOn: string;   // "Landlord · David Chen" | "Tenant · Mia Russo" | ...
  nextAction: string;  // Suggested next step
  waiting: string;     // How long it has been waiting
  lastUpdate: string;  // Last update time
}
```

Convention for `waitingOn`: `"<Role> · <Name>"` (middle-dot separated). The detail page parses this field to render the Stakeholders panel and timeline.

---

## 6. Authentication (Clerk Email OTP)

Authentication is provided by [Clerk](https://clerk.com) using `@clerk/tanstack-react-start` 1.7.x.

### Architecture

```
ClerkProvider (__root.tsx)
    ↓
clerkMiddleware() (start.ts, server side)
    ↓
useAuth() (auth.tsx wrapper) → every page reads the user through this hook
```

### Sign-in / sign-up flow

The login page uses Clerk's pre-built `<SignIn withSignUp />` component, which handles:

- Email OTP sign-in (existing accounts)
- Email OTP sign-up (new accounts, enabled by `withSignUp`)
- Google OAuth (if configured in the Clerk Dashboard)
- Bot protection / CAPTCHA
- Session creation and activation
- Redirect to `/` after sign-in (`forceRedirectUrl="/"`)

There is no need to call the Clerk signal API by hand; the component runs the whole flow.

### `useAuth()` hook API (`src/lib/auth.tsx`)

```typescript
const { user, ready, isSignedIn, signOut } = useAuth();
// user: { name: string; email: string } | null (profile data; may briefly be null)
// ready: boolean (Clerk has finished loading)
// isSignedIn: boolean (session level; updates faster than user, use it for route guards)
// signOut: () => void
```

### Adding more sign-in methods (Google / Instagram / WhatsApp)

The login page uses a Clerk pre-built component, so any method enabled in Clerk appears automatically. To add one:
1. In the [Clerk Dashboard](https://dashboard.clerk.com) → Social Connections, enable the OAuth provider
2. Create the OAuth app in the provider's developer console and set the callback URL
3. The `<SignIn />` component shows the new button with no code changes

---

## 7. AI assistant integration

`src/lib/deepseek.ts` defines a TanStack Start server function that calls the DeepSeek API on the server, so the API key never reaches the client.

**Call flow**:
```
AssistantPanel (client) → askDeepSeek (server function) → DeepSeek API → answer
```

**When no API key is configured**: the function returns a `NOT_CONFIGURED` error code and the UI shows a setup notice. Other features are unaffected.

---

## 7.5. Gmail integration (Testing mode)

The Inbox page can connect the user's own Gmail and read-only syncs up to 30 emails from the last 30 days of the inbox and sent mail.

**Flow**: `/api/gmail/connect` (redirects to Google consent) → `/api/gmail/callback` (exchanges the code; the refresh token is AES-GCM encrypted and stored in D1 `gmail_accounts`) → Inbox calls `syncGmail`, which stores emails in `email_messages`. When Gmail is not connected, the Inbox shows demo data.

| File | Purpose |
|------|---------|
| `src/lib/gmail.server.ts` | OAuth token exchange, token encryption, Gmail API fetch and parsing (server only) |
| `src/lib/gmail.functions.ts` | `getInbox` / `syncGmail` / `disconnectGmail` server functions |
| `src/routes/api.gmail.connect.ts`, `api.gmail.callback.ts` | OAuth entry point and callback (state kept in an HttpOnly cookie to prevent CSRF) |
| `drizzle/0001_*.sql` | Adds the `gmail_accounts` and `email_messages` tables |

**Environment variables**: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (`openssl rand -base64 32`). In production set them with `wrangler secret put`; locally put them in `.env.local`.

**Google Cloud setup**: enable the Gmail API → OAuth consent screen (External, Testing) → add scope `gmail.readonly` → add each user's Gmail address as a Test user → create an OAuth Client of type Web application and add `https://<deployed-domain>/api/gmail/callback` and `http://localhost:8080/api/gmail/callback` as Authorized redirect URIs.

**Known limitations**:
- In Testing mode the authorization expires after 7 days; click Connect Gmail in the Inbox again. Up to 100 test users. The consent screen shows an "unverified app" warning.
- Opening this to the public requires Google's review for the restricted scope `gmail.readonly` (possibly a CASA security assessment).
- Read-only: replies cannot be sent from the app. The Reply button opens the local email client (mailto).
- Emails are display-only for now. You can manually use "Create repair request from this email"; DeepSeek classification and automatic linking to requests are not implemented.
- Sync runs when you click Sync or open the Inbox; there is no scheduled job (a Cron Trigger could be added later).

---

## 7.6. Incident view (request detail, emails and AI next step)

Each repair request is an "incident". The Dashboard shows all of them (Board view, or the **All events** list). Opening one shows:

- **Progress line**: the five stages (New → Waiting → Action Needed → Scheduled → Completed) with the current one highlighted. Clicking a stage moves the request.
- **People involved**: Tenant, Landlord and Repair Team, each with name and email (`request_participants`), plus the signed-in property manager.
- **Activity timeline**: real emails (received and sent), status changes, notes and the creation event in one chronological list (`request_events`, `email_messages`). Emails can be expanded to read the full text.
- **AI suggested next step**: DeepSeek reads the request, people, events and linked emails and returns a summary, a next step, a suggested board column and who we are waiting on. It is stored on the request (`ai_*` columns) and only applied when the user clicks **Apply to request**.

**How emails get linked to an incident**
1. Automatically: after each Gmail sync (inbox and sent, last 30 days), an email is linked to the request whose participant is the other party (sender, or recipient for sent mail). Open requests win over completed ones (`autoLinkEmails` in `gmail.server.ts`).
2. When a person is added to a request, earlier unlinked emails with that address are linked straight away (`addParticipant`).
3. Manually: "Link an existing email" on the detail page, or "Create repair request from this email" in the Inbox (links that email).
4. Emails from unknown senders show "Add <address> as Tenant / Landlord / Repair Team" in the timeline.

**AI details**: `analyzeIncident` in `src/lib/incidents.functions.ts`. It runs automatically when the incident has emails and the analysis is missing or older than the newest email or event; otherwise use Generate / Regenerate. The prompt marks email text as untrusted data, the reply is validated with Zod, and nothing is sent or changed without the user applying it.

**Not yet verified end to end**: the full flow with a signed-in Clerk session and a real mailbox (type checks, lint, build and the local migration pass; the sign-in step cannot be automated here because of Clerk bot protection).

---

## 7.7. AI email intake (email → reviewed repair request)

In the Inbox, selecting a Gmail email (or clicking **Paste an email**) shows the **AI intake** panel:

1. **Draft repair request with AI**: DeepSeek reads the email (`analyseEmail` in `src/lib/intake.functions.ts`) and drafts the issue, address, priority, summary, next action, who we are waiting on, the sender's role, and a list of information still missing. Nothing is written yet.
2. **Safety check**: a keyword safety net (`detectSafetyRisks` in `src/lib/intake.ts`, based on NSW Fair Trading urgent-repair categories: gas, dangerous electrical faults, fire/smoke alarms, flooding, essential services, structural damage, security) runs alongside the AI. If either flags a risk, the request is forced to **Urgent**, the next action becomes "call the tenant now", and the property manager must tick "I'll handle it personally" before saving. Nothing is automated for safety issues.
3. **Review**: every field is editable. **Approve & create request** (`createRequestFromEmail`) saves the request, puts it in the right column (Action Needed for safety, Waiting if information is missing, otherwise New), adds the sender as a participant, links the email (and earlier unlinked emails from the same person), and writes timeline events: created (noting AI drafted / PM approved), AI summary, safety flag, still-needed list, and for pasted emails the original email text.

**Paste an email** works without Gmail and includes three example emails (gas smell, oven, missing address) for demos and user testing.

If `DEEPSEEK_API_KEY` is missing or the AI fails, the panel still works: it shows a notice, keeps the keyword safety check, and the property manager fills in the rest.

Tests: `src/test/intake.test.ts` (safety rules and fallback draft).

---

## 8. Completed fixes and iterations

### Round 1: 9 bug fixes

| # | Problem | Files |
|---|---------|-------|
| 1 | `addRequest` produced `REQ--Infinity` when the request list was empty | `lib/workspace.tsx` |
| 2 | The detail page silently fell back to REQ-101 when an ID was not found | `routes/requests.$id.tsx` |
| 3 | Detail page timeline / people / quote were all hard-coded to REQ-101 data | `routes/requests.$id.tsx` |
| 4 | Inbox AI suggested actions did not change with the selected message and checked state was not reset | `routes/inbox.tsx` |
| 5 | Dashboard user name and date were hard-coded ("Good morning, Sarah" / "Wednesday, 7 October") | `routes/index.tsx` |
| 6 | The profile dropdown did not close when clicking elsewhere | `components/AppShell.tsx` |
| 7 | The notification bell only toggled a red dot with no content | `components/AppShell.tsx` |
| 8 | Four unused components left as dead code at the bottom of `AssistantPanel` | `components/AssistantPanel.tsx` |
| 9 | `workspace.$section.tsx` handled 5 pages in one component; split into separate components | `routes/workspace.$section.tsx` |

### Round 2: Clerk authentication

| Change | Files |
|--------|-------|
| Integrated `@clerk/tanstack-react-start`, replacing the localStorage mock | `lib/auth.tsx` |
| Root route now uses `ClerkProvider` | `routes/__root.tsx` |
| Added `clerkMiddleware()` on the server | `start.ts` |
| Login page: Email OTP two-step flow (sign-in only) | `routes/login.tsx` |
| Added environment variable template | `.env.example` |
| Fixed `params` spread type error (exactOptionalPropertyTypes) | `components/AppShell.tsx` |
| Fixed env var bracket-notation type error | `lib/deepseek.ts` |

### Round 3: Login and sign-up via Clerk's pre-built component

| Change | Files |
|--------|-------|
| Removed 234 lines of hand-written signal API code in favour of `<SignIn withSignUp />` | `routes/login.tsx` |
| `useAuth()` gained `isSignedIn` (session level, avoids a `useUser` race) | `lib/auth.tsx` |
| `AppShell` route guard now uses `isSignedIn` instead of `!user` | `components/AppShell.tsx` |

### Round 4: Persistence and Gmail

| Change | Files |
|--------|-------|
| Repair requests persisted in Cloudflare D1 via Drizzle | `db/schema.ts`, `lib/requests.functions.ts` |
| Read-only Gmail integration for the Unified Inbox | `lib/gmail.*.ts`, `routes/api.gmail.*.ts`, `routes/inbox.tsx` |
| Incident view: progress line, people, real email timeline, AI next step, All events list | `lib/incidents.functions.ts`, `routes/requests.$id.tsx`, `routes/index.tsx` |

---

## 9. Code review findings

Found during code review, ordered by severity:

| # | Severity | Issue | Files | Notes |
|---|----------|-------|-------|-------|
| 1 | ~~P0~~ | ~~All data lived in memory and was lost on refresh~~ | `lib/workspace.tsx` | Now persisted in Cloudflare D1 (repair requests); the production database needs a one-time `--remote` migration |
| 2 | P1 | Morning Briefing is hard-coded | `routes/index.tsx:32-36` | The `briefing` array hard-codes three request IDs (REQ-087/093/106) and does not follow real data |
| 3 | P1 | Demo inbox messages are hard-coded | `routes/inbox.tsx` | `seedMessages` has six fixed messages with no link to request data (real Gmail emails are used once connected) |
| 4 | P1 | PM name hard-coded as "Sarah Miller" | `routes/requests.$id.tsx:64,273`, `routes/inbox.tsx` | Should use the signed-in user's real name from `useAuth()` |
| 5 | P2 | No dark mode colour values | `styles.css` | `@custom-variant dark` is defined but there are no dark CSS variables, only the light theme |
| 6 | P2 | Logo letter "K" does not match the brand | `components/AppShell.tsx:177`, `routes/login.tsx` | The brand is "Banjg Property"; the logo should be "B" or a proper mark |
| 7 | P2 | The "Requests" nav item points to the home page | `components/AppShell.tsx:29` | `Requests` sets `to` to `"/"`, duplicating `Home` |
| 8 | P2 | Analytics completion rate is hard-coded | `routes/workspace.$section.tsx:137` | `"Completion rate"` is fixed at `"91%"` and should be computed from requests |
| 9 | P3 | Modals lack ESC and backdrop-click to close | `routes/index.tsx:227`, `routes/requests.$id.tsx:326` | Several custom dialogs ignore the Escape key and backdrop clicks |
| 10 | P3 | Toast IDs use `Date.now()` and can collide | `lib/workspace.tsx:22` | Multiple toasts in the same millisecond share an ID; use an incrementing counter |
| 11 | P3 | Inaccurate `useMemo` dependencies | `routes/inbox.tsx` | The `actions` memo only lists `selectedId`, and the lint warning is suppressed with eslint-disable |

### Done well

- Clerk integration is solid; the `useAuth()` wrapper is clean and `isSignedIn` avoids the race
- DeepSeek is called through a server function with Zod validation and handles several failure modes
- CSRF middleware is enabled (`start.ts`)
- Clear component structure with sensible accessibility attributes (`aria-label`, `aria-modal`, `aria-live`)
- TypeScript strict mode with clear types and no `any`

---

## 10. To-do list (by priority)

### P0 — required before launch

- [x] ~~**Data persistence**~~ → **Repair requests now use Cloudflare D1** (code complete; remote migration and verification on Cloudflare still needed; inbox messages and notes are not persisted yet)
- [x] ~~**Real authentication**: replace the localStorage mock~~ → **Done** (Clerk Email OTP)
- [ ] **Meta OAuth**: integrate the Instagram / WhatsApp Business API for real social sign-in and messaging

### P1 — near term

- [ ] **Remove the hard-coded PM name**: replace "Sarah Miller" with the real user name from `useAuth()` (`requests.$id.tsx`, `inbox.tsx`)
- [ ] **Make Morning Briefing dynamic**: pick items needing attention from real requests instead of the hard-coded array in `index.tsx`
- [ ] **Extend the request data model**: add `tenantName`, `landlordName`, `tradeName`, `photos` and `timeline` to each request instead of inferring from `waitingOn`
- [ ] **File uploads**: tenants uploading repair photos
- [ ] **Email/SMS integration**: SendGrid / Twilio for real sending (today "Reply" and "Send Reminder" only show a toast)
- [ ] **Calendar integration**: Google Calendar or Outlook for real appointments

### P2 — medium term

- [ ] **Dark mode**: add CSS variables under `.dark` in `styles.css`
- [ ] **Brand mark**: change the logo letter from "K" to "B" or use a proper icon
- [ ] **Dynamic completion rate in Analytics**: compute from request data instead of the hard-coded "91%"
- [ ] **Requests nav item**: remove the duplicate entry or add a dedicated list page
- [ ] **Drag-and-drop kanban**: implement card dragging (`@dnd-kit/core` recommended)
- [ ] **Multi-tenant / multi-PM**: support several property manager accounts

### P3 — long term

- [ ] **Modal behaviour**: ESC and backdrop-click to close (or migrate to Radix Dialog)
- [ ] **Toast IDs from a counter**: avoid `Date.now()` collisions
- [ ] **Fix Inbox useMemo dependencies**: complete the dependency array and drop the eslint-disable comment
- [ ] **Mobile app**: React Native client on the existing API
- [ ] **Report export**: monthly repair reports as PDF / Excel

---

## 11. Deployment

The project uses TanStack Start (on Nitro) and builds for **Cloudflare Workers** (`cloudflare-module`) by default. The database is D1; the binding is declared in `wrangler.jsonc` and Nitro merges it into `.output/server/wrangler.json` at build time. **The app must therefore be deployed on Cloudflare**: platforms such as Vercel do not provide the D1 binding, and reads and writes fail with "D1 binding `DB` is not available".

Deploying to Cloudflare:
1. Migrate the production database (first time, and after schema changes): `npx wrangler d1 migrations apply DB --remote`
2. Build: `npm run build`
3. Deploy: `npx wrangler deploy --config .output/server/wrangler.json`
4. Set Worker secrets (`npx wrangler secret put <NAME> --name banjg-property`, paste the value when prompted; never put them in code or chat):
   - `VITE_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `DEEPSEEK_API_KEY` (optional)
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (for Gmail)
5. In the Clerk Dashboard → Domains, allow the Worker's domain

**Current deployment**: `https://banjg-property.86yixuanchen.workers.dev` (Worker name `banjg-property`).

Note: `wrangler.jsonc` pins `compatibility_date`. Nitro defaults to the local machine's "today", and a machine in Australian time can be a day ahead of Cloudflare's servers (UTC), which Cloudflare rejects (error 10021). When updating the date, use a value no later than today in UTC.

**Verified**: running the build locally with `wrangler dev`, the server obtains the D1 binding through `getRequest().runtime.cloudflare.env.DB` and runs queries. **Not verified**: the full read/write flow with a Clerk session (requires a real sign-in).
