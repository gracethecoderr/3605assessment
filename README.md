# Banjg Property

AI-assisted repair coordination for Australian property managers. See [HANDOVER.md](HANDOVER.md) for setup, architecture and the to-do list, and [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md) for the project plan.

## Demo

Open the deployed demo at [banjg-property.86yixuanchen.workers.dev](https://banjg-property.86yixuanchen.workers.dev).

- Email: `demo+clerk_test@example.com`
- Verification code: `424242`
- Username: `banjg_demo`
- Password: not required

The demo account contains fictional repair requests, contacts, emails, quotes, appointments and AI summaries. Its Gmail connection is simulated, so no real email is sent. This is a shared Clerk development-mode account with a fixed test code; use it only for demonstrations and do not enter real or sensitive information.

## Development

Requires Node.js 20+ and npm.

```sh
npm install
cp .env.example .env.local   # fill in Clerk, DeepSeek and (optional) Google keys
npx wrangler d1 migrations apply DB --local
npm run dev
```

## Built with

- TanStack Start
- TypeScript
- React
- Tailwind CSS
- Clerk
- Cloudflare D1 + Drizzle
