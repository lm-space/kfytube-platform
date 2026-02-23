# KfyTube - App Use Cases & Access Guide

## Access URLs

| URL | Description |
|-----|-------------|
| https://tube.twozao.com | Main public site (global videos) |
| https://tube.twozao.com/admin | Admin dashboard |
| https://tube.twozao.com?tenant=learn | Test tenant view via query param |
| https://learn.tube.twozao.com | Tenant subdomain (requires manual DNS setup) |
| https://tube-api.twozao.com/api | Backend API |

---

## User Credentials

| Role | Email | Password | Access |
|------|-------|----------|--------|
| Super Admin | admin@kfytube.com | password | Full access: Videos, Categories, Playlists, Users, Subdomains |

---

## Admin Features

### 1. Videos Tab
- View all videos (filtered by tenant if on subdomain)
- Add videos manually via YouTube URL
- Edit video title, category
- Delete videos
- Drag & drop reorder within category

### 2. Categories Tab
- Create/edit/delete categories
- Drag & drop reorder
- Categories are tenant-scoped

### 3. Playlists Tab
- Create/edit/delete playlists
- Add/remove videos from playlists
- Drag & drop reorder

### 4. Users Tab (Super Admin only)
- Invite new users via magic link
- Edit user email, channel name, **telegram handle**
- Delete users
- **Telegram handle** links user to auto-assign videos from Telegram

### 5. Subdomains Tab (Super Admin only)
- Create new tenants (subdomains)
- Edit tenant name, description
- Activate/deactivate tenants
- Invite users to specific tenants

---

## Telegram Bot Integration

### Bot Setup
- Bot receives YouTube links and adds them to the database
- Videos are auto-categorized based on message content

### Sending Videos via Telegram

**Basic Usage:**
```
https://youtube.com/watch?v=xxxxx
```
Adds video to last used category, global tenant (tenant_id=0)

**With Category (existing or new):**
```
MATH https://youtube.com/watch?v=xxxxx
```
- If "Math" category exists: assigns to it
- If not: creates new "Math" category

**With Tenant Override:**
```
learn https://youtube.com/watch?v=xxxxx
```
- Assigns video to `learn` tenant (learn.tube.twozao.com)
- Works regardless of who sends the message
- Confirmation: `Added 1 video(s) to 'Category' [learn.tube.twozao.com]`

**Tenant + Category:**
```
learn MATH https://youtube.com/watch?v=xxxxx
```
- Assigns to `learn` tenant AND `Math` category

**Channel Import:**
```
https://youtube.com/@channelname
```
- Imports all videos from the YouTube channel
- Creates a playlist with channel name

### Auto-Assignment via Telegram Handle

1. Go to Admin → Users
2. Edit user, set **Telegram** field to `@username`
3. When that Telegram user sends videos, they auto-assign to user's tenant

**Priority:**
1. Message starts with tenant slug → use that tenant
2. User has telegram_handle linked → use user's tenant
3. Otherwise → global (tenant_id=0)

---

## Multi-Tenant System

### How Tenants Work

| tenant_id | Meaning |
|-----------|---------|
| 0 | Global (visible on main site) |
| 1+ | Specific tenant subdomain |

### Creating a Tenant

1. Go to Admin → Subdomains
2. Click "New Subdomain"
3. Enter:
   - **Slug**: `learn` (becomes learn.tube.twozao.com)
   - **Name**: "Learning Videos"
   - **Description**: Optional

### Testing Tenant Views

**Via Query Parameter (no DNS needed):**
```
https://tube.twozao.com?tenant=learn
```

**Via Actual Subdomain (requires setup):**
1. Add DNS CNAME: `learn.tube` → `kfyapp.pages.dev`
2. Add custom domain in Cloudflare Pages: `learn.tube.twozao.com`
3. Access: `https://learn.tube.twozao.com`

### Tenant Isolation

- Videos with `tenant_id=X` only appear on that tenant's subdomain
- Categories and playlists are also tenant-scoped
- Global videos (tenant_id=0) do NOT appear on tenant subdomains
- Tenant videos do NOT appear on global site

---

## API Endpoints

### Public (no auth)
```
GET /api/videos         # List videos (filtered by tenant header)
GET /api/categories     # List categories
GET /api/playlists      # List playlists
GET /api/tenant-info    # Get current tenant info
```

### Authenticated
```
POST /api/videos        # Create video
PUT /api/videos/:id     # Update video
DELETE /api/videos/:id  # Delete video
```

### Admin Only
```
GET /api/users                  # List all users
PUT /api/users/:id              # Update user (email, channel_name, telegram_handle)
DELETE /api/users/:id           # Delete user
GET /api/tenants                # List all tenants
POST /api/tenants               # Create tenant
PUT /api/tenants/:id            # Update tenant
DELETE /api/tenants/:id         # Delete tenant
POST /api/tenants/:id/invite    # Invite user to tenant
```

### Tenant Header
All API requests can include:
```
X-Tenant-Slug: learn
```
This filters results to that tenant.

---

## Cloudflare Setup Checklist

### DNS Records (twozao.com)
- [x] `tube` CNAME → kfyapp.pages.dev (Proxied)
- [x] `tube-api` CNAME → kfytube.rugan.workers.dev (Proxied)
- [ ] `*.tube` CNAME → kfyapp.pages.dev (Requires Pro plan)
- [ ] Individual tenant CNAMEs as needed

### Custom Domains
- [x] Pages: tube.twozao.com
- [x] Worker: tube-api.twozao.com
- [ ] Pages: *.tube.twozao.com (Requires Pro plan)

---

## Common Workflows

### Add a New Tenant

1. Admin → Subdomains → New Subdomain
2. Enter slug (e.g., `kids`)
3. Test: `https://tube.twozao.com?tenant=kids`
4. Optional: Set up DNS for real subdomain

### Assign User to Tenant

1. Admin → Users → Edit user
2. Set Telegram handle (e.g., `@johnsmith`)
3. User's Telegram video submissions auto-assign to their tenant

### Quick Video Add via Telegram

```
learn SCIENCE https://youtube.com/watch?v=abc123
```
Result: Video added to `learn` tenant, `Science` category

### Import YouTube Channel

```
learn https://youtube.com/@kurzgesagt
```
Result: All channel videos imported to `learn` tenant

---

## Troubleshooting

### Videos Not Showing
- Check tenant_id in database
- Verify X-Tenant-Slug header in browser DevTools
- Use `?tenant=slug` to test

### Telegram Not Working
- Check bot token is set in Cloudflare Worker secrets
- View logs: `npx wrangler tail` in backend folder
- Check `telegram_debug_logs` table in D1

### CORS Errors
- API is at tube-api.twozao.com
- All origins allowed (`*`)
- Check X-Tenant-Slug is in allowed headers
