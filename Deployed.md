# KfyTube - Video Curation Platform

## Deployment Info

**Status:** ✅ Live
**Folder:** `/kfytube`
**Theme:** AI-powered video curation with content safety scoring

## URLs
- **Frontend:** https://tube.twozao.com
- **API:** https://tube-api.twozao.com
- **Admin:** https://tube.twozao.com/admin
- **Telegram Bot:** @kfytube_bot

## Tech Stack
- **Frontend:** Svelte + Vite
- **Backend:** Hono on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **AI:** Cloudflare Workers AI (Mistral 7B)
- **Messaging:** Telegram Bot API

## Cloudflare Resources
| Resource | Name | ID |
|----------|------|-----|
| Pages Project | `kfyapp` | - |
| Worker | `kfytube` | - |
| D1 Database | `kfytube-db` | `878ae6d1-0b8e-4824-a05b-9370eeee5a86` |

## Deploy
```bash
./deploy-app.sh kfytube
```

## Key Features
- **Content Safety Scoring** (0-100) for kids' safety
- **Admin Dashboard** for video approval/rejection
- **Telegram Integration** for video distribution
- **Playlist Management** with categories
- **User Session Management** with JWT tokens
- **Video Analytics** and statistics

## Admin Dashboard
- Content safety scores (red, amber, green, dark red)
- Bulk video evaluation
- Concern detection (violence, inappropriate, scary, etc.)
- Pagination with filtering

## For Complete Details
See: [../Deployed.md](../Deployed.md) and [../Ideas/docs/CLOUDFLARE_SETUP.md](../Ideas/docs/CLOUDFLARE_SETUP.md)
