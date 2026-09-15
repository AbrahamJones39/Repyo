# RepYo

HIPAA-compliant SaaS platform connecting healthcare providers with credentialed medical device representatives. Streamlines scheduling, rep dispatch, territory management, and real-time tracking.

## Tech Stack

- **Framework:** Next.js 16 (App Router)
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth.js v5 with RBAC (4 roles)
- **Real-time:** Server-Sent Events (SSE) with in-process event bus
- **PHI Encryption:** AES-256-GCM at rest
- **UI:** Tailwind CSS 4, Lucide icons

## User Roles

| Role | Route | Description |
|------|-------|-------------|
| `PROVIDER` | `/provider` | Request reps, track cases, favorites |
| `REP` | `/rep` | Accept requests, manage availability |
| `COMPANY_ADMIN` | `/company` | Rep/territory management, analytics |
| `SUPER_ADMIN` | `/admin` | Platform tenant & system management |

## Getting Started

### Prerequisites

- Node.js >= 20.9 (recommended) or 20.19+ for latest Prisma
- PostgreSQL database

### Setup

**Requires Node.js >= 20.9** (use `nvm use` in the project root).

```bash
# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your DATABASE_URL, AUTH_SECRET, and PHI_ENCRYPTION_KEY

# Generate secrets
openssl rand -base64 32  # Use for AUTH_SECRET and PHI_ENCRYPTION_KEY

# Push schema and seed demo data
npm run db:setup

# Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Demo Accounts

| Email | Role | Password |
|-------|------|----------|
| provider@demo.com | Healthcare Provider | demo123 |
| rep@demo.com | Device Rep | demo123 |
| admin@demo.com | Company Admin | demo123 |
| super@demo.com | Platform Admin | demo123 |

## Architecture

```
src/
├── app/
│   ├── provider/     # Module A: Provider Portal
│   ├── rep/          # Module B: Rep Mobile/Web App
│   ├── company/      # Module D: Company Dashboard
│   ├── admin/        # Module E: Super Admin Portal
│   └── api/
│       ├── requests/ # Service request CRUD + status updates
│       ├── rep/      # Rep profile & location
│       └── notifications/stream/  # SSE real-time
├── lib/
│   ├── routing-engine.ts  # Module C: Intelligent rep routing
│   ├── encryption.ts      # HIPAA PHI encryption
│   └── auth.ts            # NextAuth + RBAC
└── components/
```

### Intelligent Routing Engine

When a provider submits a request, the engine:

1. Filters reps by **company**, **active credentialing**, and **territory coverage**
2. Checks **availability** (not busy/vacation/off-duty)
3. Ranks by **proximity** to the facility
4. Assigns the nearest eligible rep and sends real-time notification

### Request Status Pipeline

`Searching → Assigned → Pending → Accepted → En Route → Arrived → Complete`

### HIPAA Security

- Patient name and DOB encrypted with AES-256-GCM before database storage
- TLS required in transit (configure at deployment)
- Role-based middleware guards all portal and API routes
- PHI fields never logged or exposed in API list responses without decryption auth

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run db:push` | Push Prisma schema to DB |
| `npm run db:seed` | Seed demo data |
| `npm run db:setup` | Push schema + seed |

## Production Notes

- Replace in-process SSE event bus with Redis pub/sub for multi-instance deployments
- Use AWS KMS or HashiCorp Vault for PHI encryption key management
- Enable audit logging for all PHI access
- Integrate Symplr/Vendormate credentialing APIs
- Add map provider (Google Maps / Mapbox) for live GPS tracking UI

## Deploy to Vercel (gorepyo.com)

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for the full checklist:

1. Create a Neon PostgreSQL database
2. Set environment variables in Vercel (`DATABASE_URL`, `AUTH_SECRET`, `AUTH_URL`, `NEXT_PUBLIC_APP_URL`, `PHI_ENCRYPTION_KEY`)
3. Import this repo on [vercel.com/new](https://vercel.com/new)
4. Run `npm run db:push` and `npm run db:seed` against production DB
5. Add **gorepyo.com** in Vercel Domains and configure DNS

Production URLs:

- App: `https://gorepyo.com`
- Provider portal: `https://gorepyo.com/provider`
- Rep portal (web): `https://gorepyo.com/rep`
- Company dashboard: `https://gorepyo.com/company`
- Rep mobile app: [Repyo-Mobile](https://github.com/AbrahamJones39/Repyo-Mobile) (Expo, talks to `/api/mobile/auth/*`)
