# KfyTube - Multi-Tenant Video Platform

A YouTube-like video curation platform built on Cloudflare Workers, Pages, and D1.

## Live URLs

| Environment | URL | Description |
|-------------|-----|-------------|
| **Frontend** | https://tube.twozao.com | Main public site |
| **Frontend (legacy)** | https://kfyapp.pages.dev | Cloudflare Pages URL |
| **API** | https://tube-api.twozao.com | Custom domain API |
| **API (legacy)** | https://kfytube.rugan.workers.dev | Workers URL |
| **Admin** | https://tube.twozao.com/admin | Admin dashboard |

---

## Project Codes & Cloudflare Resources

### Cloudflare Account Resources

| Resource | Name | ID/URL |
|----------|------|--------|
| **Worker** | kfytube | `kfytube.rugan.workers.dev` |
| **Pages Project** | kfyapp | `kfyapp.pages.dev` |
| **D1 Database** | kfytube-db | `878ae6d1-0b8e-4824-a05b-9370eeee5a86` |
| **Domain** | twozao.com | Managed in Cloudflare DNS |

### DNS Records (twozao.com)

| Type | Name | Content | Proxy |
|------|------|---------|-------|
| CNAME | tube | kfyapp.pages.dev | Proxied |
| CNAME | *.tube | kfyapp.pages.dev | Proxied (Pro plan required) |
| CNAME | tube-api | kfytube.rugan.workers.dev | Proxied |

### Custom Domains

| Service | Custom Domain | Setup Location |
|---------|---------------|----------------|
| Frontend (Pages) | tube.twozao.com | Pages > Custom domains |
| Frontend (Wildcard) | *.tube.twozao.com | Pages > Custom domains (Pro) |
| Backend (Worker) | tube-api.twozao.com | wrangler.json routes |

---

## Multi-Tenant Subdomain System

KfyTube supports isolated video collections under subdomains:

- `tube.twozao.com` - Global/main site
- `learn.tube.twozao.com` - Learning videos tenant
- `play.tube.twozao.com` - Play/fun videos tenant
- `{slug}.tube.twozao.com` - Any custom tenant

### How It Works

1. **Tenant Detection**: Frontend detects subdomain from hostname
2. **API Header**: Sends `X-Tenant-Slug` header with all requests
3. **Backend Filtering**: Videos/categories filtered by `tenant_id`
4. **Telegram Integration**: User telegram handles linked to tenants

### Creating Tenants

1. Login to Admin: `/admin`
2. Go to **Subdomains** tab (admin only)
3. Click **New Subdomain**
4. Enter slug, name, description
5. Invite users with their Telegram handles

---

## Project Structure

```
kfytube/
├── backend/                 # Hono API Worker
│   ├── src/
│   │   └── index.ts        # Main API routes
│   ├── migrations/         # D1 SQL migrations
│   │   ├── 0001_init.sql
│   │   ├── ...
│   │   └── 0007_add_tenants.sql
│   └── wrangler.json       # Worker config
├── frontend/               # Svelte + Vite
│   ├── src/
│   │   ├── components/
│   │   │   ├── Admin/      # Admin dashboard tabs
│   │   │   └── Public/     # Public YouTube-style UI
│   │   ├── lib/
│   │   │   └── stores.ts   # State + tenant detection
│   │   └── App.svelte
│   └── vite.config.js
├── deploy.sh               # Full deployment script
├── start.sh                # Local dev script
└── README.md               # This file
```

---

## Deployment

### Quick Deploy (Both Backend + Frontend)

```bash
cd kfytube
./deploy.sh
```

### Manual Deployment

**Backend (Worker):**
```bash
cd backend
npm install
npx wrangler deploy
```

**Frontend (Pages):**
```bash
cd frontend
npm install
npm run build
npx wrangler pages deploy dist --project-name kfyapp --branch main
```

### Database Migrations

```bash
cd backend

# List migrations
ls migrations/

# Run a specific migration
npx wrangler d1 execute kfytube-db --file=./migrations/0007_add_tenants.sql

# Run locally (for testing)
npx wrangler d1 execute kfytube-db --local --file=./migrations/0007_add_tenants.sql
```

---

## Local Development

### Start Both Services

```bash
cd kfytube
./start.sh
```

This runs:
- Backend: `http://localhost:8787`
- Frontend: `http://localhost:5173` (proxies `/api` to backend)

### Testing Tenant Subdomains Locally

**Option 1: Query Parameter**
```
http://localhost:5173?tenant=learn
```

**Option 2: Local Hosts File**

Add to `/etc/hosts`:
```
127.0.0.1 tube.local
127.0.0.1 learn.tube.local
127.0.0.1 play.tube.local
```

Then access `http://learn.tube.local:5173`

---

## API Endpoints

### Public

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/videos | List videos (filtered by tenant) |
| GET | /api/categories | List categories |
| GET | /api/playlists | List playlists |
| GET | /api/tenant-info | Get current tenant info |

### Admin (Auth Required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/videos | Create video |
| PUT | /api/videos/:id | Update video |
| DELETE | /api/videos/:id | Delete video |
| POST | /api/categories | Create category |
| POST | /api/playlists | Create playlist |

### Tenant Management (Admin Only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/tenants | List all tenants |
| POST | /api/tenants | Create tenant |
| PUT | /api/tenants/:id | Update tenant |
| DELETE | /api/tenants/:id | Delete tenant |
| POST | /api/tenants/:id/invite | Invite user to tenant |
| GET | /api/tenants/:id/users | List tenant users |

### Telegram Integration

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/telegram-webhook | Telegram bot webhook |

---

## Configuration Files

### wrangler.json (Backend)

```json
{
    "name": "kfytube",
    "main": "src/index.ts",
    "compatibility_date": "2024-02-08",
    "routes": [
        {
            "pattern": "tube-api.twozao.com",
            "custom_domain": true
        }
    ],
    "d1_databases": [
        {
            "binding": "DB",
            "database_name": "kfytube-db",
            "database_id": "878ae6d1-0b8e-4824-a05b-9370eeee5a86"
        }
    ]
}
```

### vite.config.js (Frontend)

Proxies `/api` to local backend in dev mode.

---

## Database Schema

### Core Tables

- `users` - User accounts with tenant_id, telegram_handle
- `videos` - Video entries with tenant_id
- `categories` - Categories with tenant_id
- `playlists` - Playlists with tenant_id
- `tenants` - Tenant/subdomain definitions

### Key Columns

| Table | Column | Description |
|-------|--------|-------------|
| All | tenant_id | 0 = global, >0 = specific tenant |
| users | telegram_handle | For auto-assigning videos |
| tenants | slug | Subdomain identifier |

---

## Cloudflare Setup Checklist

### Initial Setup

- [ ] Domain `twozao.com` added to Cloudflare
- [ ] Using Cloudflare nameservers
- [ ] SSL/TLS mode: Full (strict)

### DNS Records

- [ ] `tube` CNAME → kfyapp.pages.dev (Proxied)
- [ ] `tube-api` CNAME → kfytube.rugan.workers.dev (Proxied)
- [ ] `*.tube` CNAME → kfyapp.pages.dev (Proxied) - Requires Pro

### Custom Domains

- [ ] Pages: tube.twozao.com added
- [ ] Pages: *.tube.twozao.com added (Pro plan)
- [ ] Worker: tube-api.twozao.com (via wrangler.json)

---

## Troubleshooting

### CORS Issues
- Check worker CORS headers allow the frontend domain
- Verify `X-Tenant-Slug` header is being sent

### SSL Certificate Pending
- Wait 5-10 minutes for auto-provisioning
- Ensure domain is proxied (orange cloud)

### Videos Not Showing
- Check tenant_id filtering in API
- Verify X-Tenant-Slug header in browser DevTools

### 522 Connection Timed Out
- Check worker logs: `npx wrangler tail`
- Verify D1 database connectivity

---

## Future Improvements

- [ ] **Worker Proxy for Wildcard Subdomains**: Create a Worker to proxy `*.tube.twozao.com` requests to Pages, enabling automatic subdomain support without Pro plan. This eliminates manual DNS/Pages setup for each new tenant.

---

## Related Documentation

- [SUBDOMAIN_SETUP.md](../SUBDOMAIN_SETUP.md) - Detailed wildcard DNS setup
- [Cloudflare Workers Docs](https://developers.cloudflare.com/workers/)
- [Cloudflare Pages Docs](https://developers.cloudflare.com/pages/)
- [D1 Database Docs](https://developers.cloudflare.com/d1/)
