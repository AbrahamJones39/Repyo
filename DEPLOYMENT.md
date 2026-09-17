# Deploying RepYo to Vercel (gorepyo.com)

This guide covers everything needed before and after your first Vercel deployment.

## Prerequisites

- [Vercel account](https://vercel.com)
- [GitHub account](https://github.com) (repo connected to Vercel)
- [Neon](https://neon.tech) PostgreSQL database (free tier works)
- Domain **gorepyo.com** with DNS access

## 1. Database (Neon)

1. Create a project at [neon.tech](https://neon.tech).
2. Copy the **pooled** connection string (`?sslmode=require`).
3. Use this as `DATABASE_URL` in Vercel (required for serverless).

### Apply schema (one-time, from your machine)

```bash
cp .env.example .env
# Paste your Neon DATABASE_URL into .env

npm install
npm run db:push      # create tables
npm run db:seed      # optional: demo accounts
```

> Run `db:push` and `db:seed` locally against the production database before go-live, or use a CI job. Production Vercel builds now run `prisma db push` so new columns (org units, session version, manager) are applied on deploy. Do **not** run `db:seed` in the Vercel build — it would reset demo data.

## 2. Generate secrets

```bash
openssl rand -base64 32   # AUTH_SECRET
openssl rand -base64 32   # PHI_ENCRYPTION_KEY
```

Save both — you will add them in Vercel.

## 3. Environment variables (Vercel)

In **Vercel → Project → Settings → Environment Variables**, add:

| Variable | Production value | Notes |
|----------|------------------|-------|
| `DATABASE_URL` | `postgresql://...` | Neon **pooled** URL |
| `AUTH_SECRET` | `(openssl output)` | Required |
| `AUTH_URL` | `https://gorepyo.com` | Must match public URL |
| `NEXT_PUBLIC_APP_URL` | `https://gorepyo.com` | No trailing slash |
| `PHI_ENCRYPTION_KEY` | `(openssl output)` | 32-byte base64; do not rotate after data exists |

Apply to **Production**, **Preview**, and **Development** (use localhost URLs for Development).

## 4. Deploy on Vercel

### Option A — Import from GitHub (recommended)

1. Push this repo to GitHub (see README).
2. Go to [vercel.com/new](https://vercel.com/new).
3. Import the **Repyo** repository.
4. Framework preset: **Next.js** (auto-detected).
5. Build command: `npm run build` (default).
6. Install command: `npm install` (default).
7. Add environment variables from step 3.
8. Click **Deploy**.

### Option B — Vercel CLI

```bash
npm i -g vercel
vercel login
vercel link
vercel env pull .env.local   # optional, for local prod testing
vercel --prod
```

## 5. Connect gorepyo.com

1. **Vercel → Project → Settings → Domains**
2. Add `gorepyo.com` and `www.gorepyo.com`
3. At your domain registrar, add the DNS records Vercel shows:

   | Type | Name | Value |
   |------|------|-------|
   | `A` | `@` | `76.76.21.21` |
   | `CNAME` | `www` | `cname.vercel-dns.com` |

   (Use the exact values Vercel displays — they may differ.)

4. Wait for DNS propagation (minutes to 48 hours).
5. Vercel provisions SSL automatically.

6. Update env vars if you deployed before adding the domain:
   - `AUTH_URL=https://gorepyo.com`
   - `NEXT_PUBLIC_APP_URL=https://gorepyo.com`
7. **Redeploy** after changing env vars.

## 6. Post-deploy checklist

- [ ] `https://gorepyo.com` loads the home page
- [ ] Sign in works (`provider@demo.com` / `demo123` if seeded)
- [ ] Provider dashboard loads requests
- [ ] Company admin can view reps and requests
- [ ] Rep portal works at `/rep` (web stand-in for future mobile app)

## 7. Production notes

- **Rep mobile app:** `/rep` routes are the web stand-in; a native app can use the same API routes later.
- **SSE / real-time:** Uses an in-process event bus — works on a single Vercel instance; use Redis pub/sub for multi-region scale.
- **PHI key:** Never change `PHI_ENCRYPTION_KEY` after encrypting live patient data without a migration plan.
- **Node version:** Vercel uses Node 20.x (see `.nvmrc`).

## Troubleshooting

| Issue | Fix |
|-------|-----|
| Build fails on Prisma | Ensure `postinstall` runs (`prisma generate` in package.json) |
| `Unauthorized` on API calls | Set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to your live domain |
| Database connection errors | Use Neon **pooler** URL, not direct, for `DATABASE_URL` |
| `MissingSecret` on login | Add `AUTH_SECRET` in Vercel → Settings → Environment Variables for **Production** and **Preview**, value only (no quotes), then **Redeploy** |
| Page still broken after setting env vars | Env vars do not apply to old deployments — always **Redeploy** after changes |
| `gorepyo.com` shows a parking/lander page | DNS is not pointed at Vercel yet — update A/CNAME records at your registrar (see step 5) |
| Vercel URL redirects to vercel.com login | Turn off **Deployment Protection** under Vercel → Project → Settings → Deployment Protection (or add yourself as an allowed user) |
| Login works on `*.vercel.app` but not custom domain | Set `AUTH_URL` and `NEXT_PUBLIC_APP_URL` to the exact URL in your browser bar, then redeploy |
| Login redirect loop | Clear cookies; verify `AUTH_SECRET` is set in Production env |
| Empty database | Run `npm run db:push` and `npm run db:seed` against production `DATABASE_URL` |
