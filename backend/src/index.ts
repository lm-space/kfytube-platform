import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { evaluateVideoSafetyForKids } from './ai/content-safety'

type Bindings = {
    DB: D1Database;
    TELEGRAM_BOT_TOKEN: string;
    YOUTUBE_API_KEY?: string;  // Optional YouTube Data API v3 key for stats & madeForKids
    AI: any;  // Cloudflare Workers AI binding
}

// User Context
type User = {
    id: number;
    email: string;
    channel_name: string;
    telegram_chat_id?: string; // Future proofing
    tenant_id?: number;
    telegram_handle?: string;
}

// Tenant Context
type Tenant = {
    id: number;
    slug: string;
    name: string;
    description?: string;
    is_active: number;
}

const app = new Hono<{ Bindings: Bindings, Variables: { user: User, tenant: Tenant | null, tenantId: number } }>()

// --- HELPERS ---
async function sendTelegramReply(token: string, chatId: number, text: string) {
    if (!token) return;
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text })
    });
}

function parseVideoSource(urlStr: string): { id: string, source: string, isShort?: boolean } | null {
    try {
        const url = new URL(urlStr);
        const hostname = url.hostname.replace('www.', '');

        // 1. YouTube
        if (hostname === 'youtu.be' || hostname.includes('youtube.com') || hostname.includes('youtube-nocookie.com')) {
            let id = null;
            let isShort = false;
            if (hostname === 'youtu.be') id = url.pathname.slice(1);
            else if (url.pathname === '/watch') id = url.searchParams.get('v');
            else if (url.pathname.startsWith('/shorts/')) {
                id = url.pathname.split('/shorts/')[1];
                isShort = true;
            }
            else if (url.pathname.startsWith('/embed/')) id = url.pathname.split('/embed/')[1];
            else if (url.pathname.startsWith('/v/')) id = url.pathname.split('/v/')[1];

            if (!id) {
                // Regex Fallback for YT
                const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([a-zA-Z0-9_-]{11})/;
                const match = urlStr.match(regExp);
                if (match) {
                    id = match[2];
                    if (match[1] === 'shorts/') isShort = true;
                }
            }
            if (id) return { id: id, source: 'youtube', isShort };
        }

        // 2. Instagram
        if (hostname.includes('instagram.com')) {
            return { id: urlStr, source: 'instagram' };
        }

        // 3. Twitter / X
        if (hostname.includes('twitter.com') || hostname.includes('x.com')) {
            return { id: urlStr, source: 'twitter' };
        }

        // 4. TikTok - treat as short
        if (hostname.includes('tiktok.com')) {
            return { id: urlStr, source: 'tiktok', isShort: true };
        }

        // 5. Facebook
        if (hostname.includes('facebook.com') || hostname.includes('fb.watch')) {
            return { id: urlStr, source: 'facebook' };
        }

    } catch (e) { }

    // Final Fallback for strict YT ID if URL matches regex
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=|shorts\/)([a-zA-Z0-9_-]{11})/;
    const match = urlStr.match(regExp);
    if (match) {
        return { id: match[2], source: 'youtube', isShort: match[1] === 'shorts/' };
    }
    return null;
}

/**
 * Insert or update a video from Telegram and move it to the top of its category
 * (ORDER BY display_order ASC). INSERT OR IGNORE left duplicates unchanged, so
 * reposts did not refresh category/title or surface the item at the top.
 */
async function upsertTelegramVideo(
    db: D1Database,
    params: {
        youtubeId: string;
        title: string;
        categoryId: number | null;
        source: string;
        isShort: boolean;
        tenantId: number;
    }
): Promise<boolean> {
    const { youtubeId, title, categoryId, source, isShort, tenantId } = params;
    const isShortInt = isShort ? 1 : 0;

    const existing = await db.prepare(`
        SELECT id FROM videos
        WHERE youtube_id = ?
        ORDER BY (CASE WHEN COALESCE(tenant_id, 0) = ? THEN 1 ELSE 0 END) DESC, id DESC
        LIMIT 1
    `).bind(youtubeId, tenantId).first() as { id: number } | null;

    let videoId: number | null = existing?.id ?? null;

    if (videoId != null) {
        await db.prepare(`
            UPDATE videos SET
                title = ?,
                category_id = ?,
                source_type = ?,
                is_short = ?,
                tenant_id = ?,
                is_global = 1
            WHERE id = ?
        `).bind(title, categoryId, source, isShortInt, tenantId, videoId).run();
    } else {
        const ins = await db.prepare(`
            INSERT INTO videos (youtube_id, title, category_id, is_global, source_type, is_short, tenant_id)
            VALUES (?, ?, ?, 1, ?, ?, ?)
        `).bind(youtubeId, title, categoryId, source, isShortInt, tenantId).run();
        const lid = ins.meta?.last_row_id;
        videoId = typeof lid === 'number' && lid > 0 ? lid : null;
    }

    if (videoId == null) return false;

    let minRow: { m: number | null } | null;
    if (categoryId != null) {
        minRow = await db.prepare(`
            SELECT MIN(display_order) AS m FROM videos
            WHERE category_id = ? AND id != ?
        `).bind(categoryId, videoId).first() as { m: number | null } | null;
    } else {
        minRow = await db.prepare(`
            SELECT MIN(display_order) AS m FROM videos
            WHERE category_id IS NULL AND id != ?
        `).bind(videoId).first() as { m: number | null } | null;
    }
    const minOrder = minRow?.m;
    const nextOrder = minOrder == null ? 0 : minOrder - 1;
    await db.prepare('UPDATE videos SET display_order = ? WHERE id = ?').bind(nextOrder, videoId).run();

    return true;
}

// --- TELEGRAM WEBHOOK ---
app.get('/api/telegram-debug', async (c) => {
    const logs = await c.env.DB.prepare('SELECT * FROM telegram_debug_logs ORDER BY id DESC LIMIT 20').all();
    return c.json(logs.results);
})

app.post('/api/telegram-webhook', async (c) => {
    // 1. Verify Token presence
    const token = c.env.TELEGRAM_BOT_TOKEN;
    if (!token) return c.json({ error: 'Bot Not Configured' }, 500);

    const update = await c.req.json();
    const message = update.message;

    // DEBUG LOGGING
    const telegramUsername = message?.from?.username || null;
    try {
        const sender = telegramUsername || message?.from?.id?.toString() || 'unknown';
        await c.env.DB.prepare('INSERT INTO telegram_debug_logs (payload, sender) VALUES (?, ?)').bind(JSON.stringify(update), sender).run();
    } catch (e) {
        console.error("Debug Log Failed", e);
    }

    // Ignore non-text or utility updates
    if (!message || !message.text) return c.json({ ok: true });

    const chatId = message.chat.id;
    const text = (message.text || '').trim();

    // TENANT DETECTION: Look up user by telegram handle to get their tenant_id
    let userTenantId = 0; // Default to global
    let linkedUser: any = null;
    if (telegramUsername) {
        try {
            linkedUser = await c.env.DB.prepare('SELECT * FROM users WHERE telegram_handle = ?')
                .bind(`@${telegramUsername}`).first();
            if (!linkedUser) {
                // Try without @ prefix
                linkedUser = await c.env.DB.prepare('SELECT * FROM users WHERE telegram_handle = ?')
                    .bind(telegramUsername).first();
            }
            if (linkedUser && linkedUser.tenant_id) {
                userTenantId = linkedUser.tenant_id;
            }
        } catch (e) {
            console.error("Telegram user lookup failed", e);
        }
    }

    // 2. Simple Command: /start
    if (text.startsWith('/start')) {
        await sendTelegramReply(token, chatId, "👋 Hi! Send me a YouTube link and I'll add it to KfyTube.\n\n💡 Tips:\n• Type a tenant slug to assign to subdomain: 'learn http://...'\n• Type a category name in CAPS to auto-assign: 'MATH http://...'\n• Send a channel URL (with @) to import all videos: 'https://youtube.com/@channelname'");
        return c.json({ ok: true });
    }

    // 2.5 TENANT OVERRIDE: Check if first word is a tenant slug (e.g., "learn https://...")
    // This allows assigning videos to specific tenants regardless of user's telegram_handle
    const words = text.split(/\s+/);
    if (words.length >= 2 && !words[0].startsWith('http')) {
        const possibleTenantSlug = words[0].toLowerCase();
        try {
            const tenantOverride = await c.env.DB.prepare('SELECT * FROM tenants WHERE slug = ? AND is_active = 1')
                .bind(possibleTenantSlug).first() as any;
            if (tenantOverride) {
                userTenantId = tenantOverride.id;
                // Remove the tenant slug from text for further processing
                // (so it doesn't get confused with category names)
            }
        } catch (e) {
            console.error("Tenant override lookup failed", e);
        }
    }

    // 3. Extract Links
    const urlMatch = text.match(/(https?:\/\/[^\s]+)/g);
    if (!urlMatch) {
        return c.json({ ok: true });
    }

    // 3.5 Check if this is a YouTube CHANNEL URL (contains /@)
    const channelUrl = urlMatch.find(url => url.includes('youtube.com/@') || url.includes('youtube.com/channel/'));
    if (channelUrl) {
        // This is a channel import request
        await sendTelegramReply(token, chatId, `🔄 Detected YouTube channel. Importing videos...`);

        try {
            // Extract the channel handle or ID from URL
            let channelInput = channelUrl;
            const handleMatch = channelUrl.match(/youtube\.com\/@([^\/\?]+)/);
            if (handleMatch) {
                channelInput = `@${handleMatch[1]}`;
            }

            const channelId = await resolveChannelId(channelInput);
            if (!channelId) {
                await sendTelegramReply(token, chatId, `❌ Could not resolve channel ID from: ${channelUrl}`);
                return c.json({ ok: true });
            }

            const videos = await fetchChannelVideos(channelId);
            if (!videos || videos.length === 0) {
                await sendTelegramReply(token, chatId, `❌ Could not fetch videos from channel. Try again later.`);
                return c.json({ ok: true });
            }

            // Get channel name for playlist
            let channelName = await fetchChannelName(channelId) || channelId;

            const playlistName = `${channelName} - ${channelId}`;

            // Find or Create Channel User
            const channelEmail = `${channelId}@imported.kfytube`;
            let channelUser: any = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(channelEmail).first();

            if (!channelUser) {
                channelUser = await c.env.DB.prepare('INSERT INTO users (email, channel_name, tenant_id) VALUES (?, ?, 0) RETURNING id')
                    .bind(channelEmail, channelName).first();
            }
            const targetChannelUserId = channelUser.id;

            // Check if Playlist already exists (for this tenant)
            let playlistId;
            let isNew = false;
            const existingPl: any = await c.env.DB.prepare('SELECT id FROM playlists WHERE source_channel_id = ? AND (tenant_id = ? OR tenant_id IS NULL)')
                .bind(channelId, userTenantId).first();

            if (existingPl) {
                playlistId = existingPl.id;
            } else {
                const max = await c.env.DB.prepare('SELECT MAX(display_order) as m FROM playlists').first();
                const nextOrder = (max?.m as number || 0) + 1;

                const plResult: any = await c.env.DB.prepare('INSERT INTO playlists (name, display_order, is_global, channel_id, source_channel_id, tenant_id) VALUES (?, ?, 1, 1, ?, ?) RETURNING id')
                    .bind(playlistName, nextOrder, channelId, userTenantId).first();
                playlistId = plResult.id;
                isNew = true;

                // Add to playlist_tenants for visibility
                await c.env.DB.prepare('INSERT OR IGNORE INTO playlist_tenants (playlist_id, tenant_id) VALUES (?, ?)').bind(playlistId, userTenantId).run();
                // Also add to global if not already global
                if (userTenantId !== 0) {
                    await c.env.DB.prepare('INSERT OR IGNORE INTO playlist_tenants (playlist_id, tenant_id) VALUES (?, 0)').bind(playlistId).run();
                }
            }

            // Insert Videos with tenant_id
            const insertVideo = c.env.DB.prepare('INSERT OR IGNORE INTO videos (youtube_id, title, is_global, channel_id, source_type, tenant_id) VALUES (?, ?, 1, ?, "youtube", ?)');
            const videoBatch = videos.map((v: any) => insertVideo.bind(v.id, v.title, targetChannelUserId, userTenantId));
            await c.env.DB.batch(videoBatch);

            // Link to playlist
            const placeholders = videos.map(() => '?').join(',');
            const ids = videos.map((v: any) => v.id);
            const videoRows = await c.env.DB.prepare(`SELECT id, youtube_id FROM videos WHERE youtube_id IN (${placeholders})`).bind(...ids).all();

            const videoIdMap = new Map();
            videoRows.results.forEach((r: any) => videoIdMap.set(r.youtube_id, r.id));

            const maxSort = await c.env.DB.prepare('SELECT MAX(sort_order) as m FROM playlist_items WHERE playlist_id = ?').bind(playlistId).first();
            let currentSort = (maxSort?.m as number || 0) + 1;
            if (isNew) currentSort = 0;

            const insertPl = c.env.DB.prepare('INSERT OR IGNORE INTO playlist_items (playlist_id, video_id, sort_order) VALUES (?, ?, ?)');
            const plBatch: any[] = [];
            for (const v of videos) {
                const vidId = videoIdMap.get(v.id);
                if (vidId) {
                    plBatch.push(insertPl.bind(playlistId, vidId, currentSort++));
                }
            }
            if (plBatch.length > 0) {
                await c.env.DB.batch(plBatch);
            }

            await sendTelegramReply(token, chatId, `✅ Imported ${videos.length} videos from "${channelName}" into playlist.`);

            // Log
            try {
                await c.env.DB.prepare('INSERT INTO telegram_debug_logs (payload, sender) VALUES (?, ?)')
                    .bind(JSON.stringify({ event: 'channel_import', channelId, videoCount: videos.length }), 'system').run();
            } catch (e) { }

            return c.json({ ok: true });
        } catch (e) {
            console.error("Channel Import Error", e);
            await sendTelegramReply(token, chatId, `❌ Error importing channel: ${e}`);
            return c.json({ ok: true });
        }
    }

    // 3.6 Check if this is a YouTube PLAYLIST URL (contains list=)
    const playlistUrl = urlMatch.find(url => url.includes('list=PL') || url.includes('list=UU') || url.includes('list=OL'));
    if (playlistUrl) {
        // Extract playlist ID from URL
        const listMatch = playlistUrl.match(/list=([a-zA-Z0-9_-]+)/);
        if (listMatch) {
            const playlistId = listMatch[1];
            await sendTelegramReply(token, chatId, `🔄 Detected YouTube playlist. Importing videos...`);

            try {
                const result = await fetchPlaylistVideos(playlistId);
                if (!result || result.videos.length === 0) {
                    await sendTelegramReply(token, chatId, `❌ Could not fetch videos from playlist. Try again later.`);
                    return c.json({ ok: true });
                }

                const { videos, title: playlistTitle } = result;

                // Create a user for this playlist (use playlist ID as identifier)
                const playlistEmail = `playlist_${playlistId}@imported.kfytube`;
                let playlistUser: any = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(playlistEmail).first();

                if (!playlistUser) {
                    playlistUser = await c.env.DB.prepare('INSERT INTO users (email, channel_name, tenant_id) VALUES (?, ?, 0) RETURNING id')
                        .bind(playlistEmail, playlistTitle).first();
                }
                const targetUserId = playlistUser.id;

                // Check if Playlist already exists
                let internalPlaylistId;
                let isNew = false;
                const existingPl: any = await c.env.DB.prepare('SELECT id FROM playlists WHERE source_channel_id = ? AND (tenant_id = ? OR tenant_id IS NULL)')
                    .bind(playlistId, userTenantId).first();

                if (existingPl) {
                    internalPlaylistId = existingPl.id;
                } else {
                    const max = await c.env.DB.prepare('SELECT MAX(display_order) as m FROM playlists').first();
                    const nextOrder = (max?.m as number || 0) + 1;

                    const plResult: any = await c.env.DB.prepare('INSERT INTO playlists (name, display_order, is_global, channel_id, source_channel_id, tenant_id) VALUES (?, ?, 1, ?, ?, ?) RETURNING id')
                        .bind(playlistTitle, nextOrder, targetUserId, playlistId, userTenantId).first();
                    internalPlaylistId = plResult.id;
                    isNew = true;

                    // Add to playlist_tenants for visibility
                    await c.env.DB.prepare('INSERT OR IGNORE INTO playlist_tenants (playlist_id, tenant_id) VALUES (?, ?)').bind(internalPlaylistId, userTenantId).run();
                    if (userTenantId !== 0) {
                        await c.env.DB.prepare('INSERT OR IGNORE INTO playlist_tenants (playlist_id, tenant_id) VALUES (?, 0)').bind(internalPlaylistId).run();
                    }
                }

                // Insert Videos
                const insertVideo = c.env.DB.prepare('INSERT OR IGNORE INTO videos (youtube_id, title, is_global, channel_id, source_type, tenant_id) VALUES (?, ?, 1, ?, "youtube", ?)');
                const videoBatch = videos.map((v: any) => insertVideo.bind(v.id, v.title, targetUserId, userTenantId));
                await c.env.DB.batch(videoBatch);

                // Get video internal IDs
                const placeholders = videos.map(() => '?').join(',');
                const ids = videos.map((v: any) => v.id);
                const videoRows = await c.env.DB.prepare(`SELECT id, youtube_id FROM videos WHERE youtube_id IN (${placeholders})`).bind(...ids).all();
                const videoIdMap = new Map();
                videoRows.results.forEach((r: any) => videoIdMap.set(r.youtube_id, r.id));

                // Link to playlist
                const maxSort = await c.env.DB.prepare('SELECT MAX(sort_order) as m FROM playlist_items WHERE playlist_id = ?').bind(internalPlaylistId).first();
                let currentSort = (maxSort?.m as number || 0) + 1;

                const insertPl = c.env.DB.prepare('INSERT OR IGNORE INTO playlist_items (playlist_id, video_id, sort_order) VALUES (?, ?, ?)');
                const plBatch: any[] = [];
                videos.forEach((v: any, index: number) => {
                    const vidId = videoIdMap.get(v.id);
                    if (vidId) {
                        plBatch.push(insertPl.bind(internalPlaylistId, vidId, currentSort++));
                    }
                });
                if (plBatch.length > 0) {
                    await c.env.DB.batch(plBatch);
                }

                await sendTelegramReply(token, chatId, `✅ Imported ${videos.length} videos from playlist "${playlistTitle}".`);

                // Log
                try {
                    await c.env.DB.prepare('INSERT INTO telegram_debug_logs (payload, sender) VALUES (?, ?)')
                        .bind(JSON.stringify({ event: 'playlist_import', playlistId, videoCount: videos.length }), 'system').run();
                } catch (e) { }

                return c.json({ ok: true });
            } catch (e) {
                console.error("Playlist Import Error", e);
                await sendTelegramReply(token, chatId, `❌ Error importing playlist: ${e}`);
                return c.json({ ok: true });
            }
        }
    }

    // 4. Detect Category Intent and Tenant Override
    const tokens = text.split(/\s+/);

    // Check for tenant ID override - look for a standalone integer at the end
    // Format: "url 5" or "url category 5" where 5 is tenant ID
    let overrideTenantId: number | null = null;
    const lastToken = tokens[tokens.length - 1];
    if (/^\d+$/.test(lastToken) && !lastToken.startsWith('http')) {
        const potentialTenantId = parseInt(lastToken);
        // Verify this tenant exists
        try {
            const tenantExists = await c.env.DB.prepare('SELECT id FROM tenants WHERE id = ?').bind(potentialTenantId).first();
            if (tenantExists) {
                overrideTenantId = potentialTenantId;
                // Remove the tenant ID from tokens for category processing
                tokens.pop();
            }
        } catch (e) { }
    }

    // Use override tenant if provided, otherwise use user's tenant
    const effectiveTenantId = overrideTenantId !== null ? overrideTenantId : userTenantId;

    const nonUrlTokens = tokens.filter(t => !t.startsWith('http') && t.length > 2 && /^[a-zA-Z]+$/.test(t)); // Clean tokens

    let targetCategoryId: number | null = null;
    let targetCategoryName = 'Other';
    let intentToken = null;

    // 1. Try to match EXISTING Category (Case Insensitive, within tenant)
    try {
        const allCategories: any = await c.env.DB.prepare('SELECT id, name FROM categories WHERE tenant_id = ? OR tenant_id IS NULL OR tenant_id = 0')
            .bind(effectiveTenantId).all();
        if (allCategories.results) {
            for (const t of nonUrlTokens) {
                // Exact match first
                const exactMatch = allCategories.results.find((c: any) => c.name.toLowerCase() === t.toLowerCase());
                if (exactMatch) {
                    targetCategoryId = exactMatch.id;
                    targetCategoryName = exactMatch.name;
                    intentToken = t;
                    break;
                }

                // Fuzzy match for short tokens (< 5 chars) - match "dan" to "Dance", "mus" to "Music"
                if (t.length < 5) {
                    const fuzzyMatch = allCategories.results.find((c: any) =>
                        c.name.toLowerCase().startsWith(t.toLowerCase())
                    );
                    if (fuzzyMatch) {
                        targetCategoryId = fuzzyMatch.id;
                        targetCategoryName = fuzzyMatch.name;
                        intentToken = t;
                        break;
                    }
                }
            }
        }
    } catch (e) {
        console.error("Category Fetch Error", e);
    }

    // 2. If Not Found -> Check Creation Intent (STRICT: ALL CAPS ONLY)
    if (!targetCategoryId) {
        // Only consider tokens that are strictly ALL CAPS for *new* category creation
        intentToken = nonUrlTokens.find(t => t === t.toUpperCase() && /[A-Z]/.test(t));

        if (intentToken) {
            // Convert to Title Case
            targetCategoryName = intentToken.charAt(0).toUpperCase() + intentToken.slice(1).toLowerCase();

            // Create New Category as Global + assign to tenant junction table
            try {
                const max: any = await c.env.DB.prepare('SELECT MAX(display_order) as m FROM categories').first();
                const nextOrder = (max?.m as number || 0) + 1;
                const result: any = await c.env.DB.prepare('INSERT INTO categories (name, display_order, is_global, channel_id, tenant_id) VALUES (?, ?, 1, NULL, 0) RETURNING id')
                    .bind(targetCategoryName, nextOrder).first();
                if (result) {
                    targetCategoryId = result.id;
                    // Add to global tenant (0) + effective tenant
                    await c.env.DB.prepare('INSERT OR IGNORE INTO category_tenants (category_id, tenant_id) VALUES (?, 0)').bind(targetCategoryId).run();
                    if (effectiveTenantId > 0) {
                        await c.env.DB.prepare('INSERT OR IGNORE INTO category_tenants (category_id, tenant_id) VALUES (?, ?)').bind(targetCategoryId, effectiveTenantId).run();
                    }
                } else {
                    // Fallback fetch (within same tenant)
                    const existing: any = await c.env.DB.prepare('SELECT id FROM categories WHERE name = ? AND (tenant_id = ? OR tenant_id = 0 OR tenant_id IS NULL)')
                        .bind(targetCategoryName, effectiveTenantId).first();
                    if (existing) targetCategoryId = existing.id;
                }
            } catch (e) { }
        }
    }

    // 3. Fallback: Last Assigned Category
    if (!targetCategoryId) {
        try {
            // Get the last video that had a valid category
            const lastVideo: any = await c.env.DB.prepare(`
                SELECT v.category_id, c.name 
                FROM videos v
                JOIN categories c ON v.category_id = c.id
                ORDER BY v.id DESC 
                LIMIT 1
            `).first();

            if (lastVideo && lastVideo.category_id) {
                targetCategoryId = lastVideo.category_id;
                targetCategoryName = lastVideo.name;
            }
        } catch (e) { console.error("Last Category Fallback Error", e); }
    }

    let addedCount = 0;
    let debugLog: string[] = [];

    for (const url of urlMatch) {
        const videoData = parseVideoSource(url);
        debugLog.push(`URL: ${url} -> Data: ${JSON.stringify(videoData)}`);

        if (videoData) {
            const { id, source, isShort } = videoData;

            // Default Title
            let title = `Imported ${source.charAt(0).toUpperCase() + source.slice(1)} Video`;

            if (source === 'youtube') {
                try {
                    const oembed = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
                    if (oembed.ok) {
                        const data: any = await oembed.json();
                        title = data.title;
                    }
                } catch (e) { }
            }

            try {
                const ok = await upsertTelegramVideo(c.env.DB, {
                    youtubeId: id,
                    title,
                    categoryId: targetCategoryId,
                    source,
                    isShort: !!isShort,
                    tenantId: effectiveTenantId
                });
                if (ok) addedCount++;
            } catch (e) {
                console.error(e);
                debugLog.push(`DB Error: ${e}`);
            }
        }
    }

    // Log the processing result to DB for visibility
    try {
        await c.env.DB.prepare('INSERT INTO telegram_debug_logs (payload, sender) VALUES (?, ?)')
            .bind(JSON.stringify({
                event: 'processing_result',
                logs: debugLog,
                intent: intentToken || 'none',
                effectiveTenantId,
                overrideTenantId,
                userTenantId
            }), 'system').run();
    } catch (e) { }

    if (addedCount > 0) {
        // Get tenant name for confirmation message
        let tenantInfo = '';
        if (effectiveTenantId > 0) {
            try {
                const tenant = await c.env.DB.prepare('SELECT name, slug FROM tenants WHERE id = ?').bind(effectiveTenantId).first() as any;
                if (tenant) {
                    tenantInfo = ` [${tenant.slug}]`;
                }
            } catch (e) { }
        } else {
            tenantInfo = ' [global]';
        }
        // Show if tenant was overridden
        const overrideNote = overrideTenantId !== null ? ' (tenant override)' : '';
        await sendTelegramReply(token, chatId, `✅ Added or updated ${addedCount} video(s) in '${targetCategoryName}' (moved to top)${tenantInfo}${overrideNote}.`);
    } else {
        const firstUrl = urlMatch[0];
        await sendTelegramReply(token, chatId, `⚠️ Found link: ${firstUrl}\nBut could not capture a valid video ID.\nSupported: YouTube, Instagram, Twitter/X, TikTok, Facebook.`);
    }

    return c.json({ ok: true });
});


// Enable CORS
app.use('/*', cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-Slug']
}))

// --- TENANT MIDDLEWARE ---
// Detects tenant from X-Tenant-Slug header or ?tenant= query param
// Sets tenantId (0 for global, >0 for specific tenant)
app.use('/api/*', async (c, next) => {
    const tenantSlug = c.req.header('X-Tenant-Slug') || c.req.query('tenant');

    if (tenantSlug) {
        const tenant = await c.env.DB.prepare('SELECT * FROM tenants WHERE slug = ? AND is_active = 1')
            .bind(tenantSlug).first() as Tenant | null;

        if (tenant) {
            c.set('tenant', tenant);
            c.set('tenantId', tenant.id);
        } else {
            c.set('tenant', null);
            c.set('tenantId', 0); // Fall back to global if tenant not found
        }
    } else {
        c.set('tenant', null);
        c.set('tenantId', 0); // Global
    }

    await next();
})

// --- AUTH MIDDLEWARE (Simplified for MVP) ---
// In a real app, verify JWT or Session Token.
// Here we mock by assuming the token *is* the user email for simplicity, or just a static token.
// The user asked for "Invite via Email" and "Secret Link".
// We will assume the frontend sends a custom header `X-Channel-ID` or `Authorization`.
app.use('/api/*', async (c, next) => {
    // Skip public endpoints
    const publicPaths = ['/api/login', '/api/invite', '/api/fetch-video-info', '/api/videos', '/api/categories', '/api/playlists'];
    if (publicPaths.includes(c.req.path) && c.req.method === 'GET') {
        // Public access allowed for GET on content
        return next();
    }
    if (c.req.path === '/api/login' || c.req.path === '/api/invite' || c.req.path.includes('magic')) {
        return next();
    }

    const authHeader = c.req.header('Authorization');

    if (authHeader) {
        // SECURITY FIX: Remove hardcoded 'mock-token' that grants instant admin access
        // Only allow authentication via valid magic_link_token stored in database

        const token = authHeader.replace('Bearer ', '');

        // SECURITY: Never accept hardcoded tokens like 'mock-token'
        // Always validate against database
        if (token !== 'mock-token') {  // Prevent hardcoded token
            const user = await c.env.DB.prepare(
                'SELECT * FROM users WHERE magic_link_token = ?'
            ).bind(token).first();

            if (user) {
                c.set('user', user as User);
            }
        }
    }
    await next();
})

// --- AUTH ENDPOINTS ---

app.get('/api/me', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    return c.json(user);
})

app.post('/api/login', async (c) => {
    // Login with Email + Password OR Magic Link flow
    const body = await c.req.json();

    // 1. Password Login
    if (body.password) {
        const user = await c.env.DB.prepare('SELECT * FROM users WHERE email = ? AND password_hash = ?')
            .bind(body.email || 'admin@kfytube.com', body.password).first();

        if (user) {
            // Check if admin to give mock-token, otherwise we need a token strategy.
            // For now, simpler: user.id=1 gets 'mock-token'. Others?
            // If we don't return a valid token that middleware recognizes (mock-token or magic-link), they can't log in.
            // Let's generate a temporary session token if needed, OR just return 'mock-token' and let middleware assume it's Admin (ID 1).
            // BUT, if I am a regular user, 'mock-token' logs me in as Admin! That's bad.
            // FIX: If I am a regular user, I should probably use my magic link token as my session token for now?
            // Or create a new session column.
            // Let's use `magic_link_token` as the reusable API token for simplicity in this MVP.
            // If it's null, generate one.

            let token = user.magic_link_token;
            if (!token) {
                token = crypto.randomUUID();
                await c.env.DB.prepare('UPDATE users SET magic_link_token = ? WHERE id = ?').bind(token, user.id).run();
            }
            return c.json({ token: token, user });
        }
        return c.json({ error: 'Invalid credentials' }, 401);
    }

    // 2. Magic Link flow (if email-only request)
    // SECURITY FIX: Removed hardcoded 'mock-token' fallback that granted instant admin access
    // Now all auth must go through proper credential verification with magic_link_token

    return c.json({ error: 'Password required for login' }, 400);
})

app.put('/api/profile', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();

    // Update Channel Name
    if (body.channel_name) {
        await c.env.DB.prepare('UPDATE users SET channel_name = ? WHERE id = ?').bind(body.channel_name, user.id).run();
    }

    // Update Password
    if (body.password) {
        // In real app: bcrypt.hash(body.password)
        await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(body.password, user.id).run();
    }

    return c.json({ success: true });
})

app.post('/api/invite', async (c) => {
    const body = await c.req.json();
    const email = body.email;
    if (!email) return c.json({ error: 'Email required' }, 400);

    // Generate specific channel name
    const channelName = email.substring(0, 4);
    const magicLink = crypto.randomUUID();

    try {
        await c.env.DB.prepare('INSERT INTO users (email, channel_name, magic_link_token) VALUES (?, ?, ?)')
            .bind(email, channelName, magicLink).run();

        // In real app: Send Email. Here: Return link.
        return c.json({ success: true, magic_link: `${magicLink}` });
    } catch (e) {
        return c.json({ error: 'User likely exists' }, 400);
    }
})


// --- CONTENT ENDPOINTS ---
// Updated to support Channel Filtering

// Aggregated home endpoint - returns everything the landing page needs in ONE call
// Cached at the edge for 5 minutes via Cloudflare Cache API
app.get('/api/home', async (c) => {
    const tenantId = c.get('tenantId') || 0;
    const user = c.get('user'); // Check if authenticated

    // Check edge cache first
    const cache = caches.default;
    const cacheUrl = new URL(c.req.url);
    cacheUrl.searchParams.set('_tenant', String(tenantId));
    cacheUrl.searchParams.set('_auth', user ? '1' : '0'); // Include auth state in cache key
    const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });

    const cached = await cache.match(cacheKey);
    if (cached) return cached;

    // Run all queries in parallel
    const tenantFilter = tenantId > 0;

    const [catsResult, videosResult, channelPlaylistsResult, curatedPlaylistsResult] = await Promise.all([
        // Categories with video counts
        c.env.DB.prepare(`
            SELECT c.id, c.name, c.display_order, c.is_featured, c.repeat_enabled,
                (SELECT COUNT(*) FROM videos v WHERE v.category_id = c.id) as video_count
            FROM categories c
            WHERE c.is_global = 1
              AND EXISTS (SELECT 1 FROM category_tenants ct WHERE ct.category_id = c.id AND ct.tenant_id = ?)
            ORDER BY c.display_order
        `).bind(tenantId).all(),

        // ALL videos in one shot (no pagination)
        c.env.DB.prepare(`
            SELECT v.id, v.title, v.youtube_id, v.source_type, v.category_id, v.channel_id,
                   v.is_short, v.is_global, v.display_order, v.duration, v.view_count,
                   v.like_count, v.published_at, v.thumbnail_url, v.created_at, v.is_visible,
                   c.name as category_name, ch.channel_name as channel_name
            FROM videos v
            LEFT JOIN categories c ON v.category_id = c.id
            LEFT JOIN users ch ON v.channel_id = ch.id
            WHERE v.is_global = 1
              ${tenantFilter ? 'AND (v.tenant_id = ? OR v.tenant_id IS NULL OR v.tenant_id = 0)' : ''}
              ${!user ? 'AND v.is_visible = 1' : ''}
            ORDER BY v.display_order ASC, v.created_at DESC
        `).bind(...(tenantFilter ? [tenantId] : [])).all(),

        // Channel playlists (sorted by admin display_order)
        c.env.DB.prepare(`
            SELECT p.id, p.name, p.display_order, p.source_channel_id, p.is_featured, p.repeat_enabled
            FROM playlists p
            WHERE p.is_global = 1
              AND p.source_channel_id LIKE 'UC%'
              AND EXISTS (SELECT 1 FROM playlist_tenants pt WHERE pt.playlist_id = p.id AND pt.tenant_id = ?)
            ORDER BY p.display_order ASC
        `).bind(tenantId).all(),

        // Curated playlists with video counts + latest video thumbnail
        c.env.DB.prepare(`
            SELECT p.id, p.name, p.display_order, p.is_featured, p.repeat_enabled,
                (SELECT COUNT(*) FROM playlist_items pi WHERE pi.playlist_id = p.id) as video_count,
                (SELECT v.youtube_id FROM playlist_items pi2 JOIN videos v ON pi2.video_id = v.id
                 WHERE pi2.playlist_id = p.id ORDER BY pi2.sort_order LIMIT 1) as latest_youtube_id
            FROM playlists p
            WHERE p.is_global = 1
              AND (p.source_channel_id IS NULL OR p.source_channel_id NOT LIKE 'UC%')
              AND EXISTS (SELECT 1 FROM playlist_tenants pt WHERE pt.playlist_id = p.id AND pt.tenant_id = ?)
            ORDER BY p.display_order ASC
        `).bind(tenantId).all(),
    ]);

    const body = JSON.stringify({
        categories: catsResult.results,
        videos: videosResult.results,
        channelPlaylists: channelPlaylistsResult.results,
        curatedPlaylists: curatedPlaylistsResult.results,
    });

    const response = new Response(body, {
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=300',
            'Access-Control-Allow-Origin': '*',
        }
    });

    // Cache at edge for 5 minutes
    c.executionCtx.waitUntil(cache.put(cacheKey, response.clone()));

    return response;
})

app.get('/api/categories', async (c) => {
    const user = c.get('user');
    const tenantId = c.get('tenantId') || 0; // Tenant filtering
    const queryChannelId = c.req.query('channel_id');
    const includeAllTenants = c.req.query('all_tenants') === '1'; // Admin view

    let where: string[] = [];
    const params: any[] = [];

    // Tenant filter using junction table (unless admin wants all)
    if (!includeAllTenants) {
        where.push('EXISTS (SELECT 1 FROM category_tenants ct WHERE ct.category_id = c.id AND ct.tenant_id = ?)');
        params.push(tenantId);
    }

    // Add scope filter (global vs channel)
    if (queryChannelId) {
        where.push('(c.is_global = 1 OR c.channel_id = ?)');
        params.push(queryChannelId);
    } else if (user) {
        where.push('(c.is_global = 1 OR c.channel_id = ?)');
        params.push(user.id);
    } else {
        where.push('c.is_global = 1');
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const query = `
        SELECT c.*,
            (SELECT COUNT(*) FROM videos v WHERE v.category_id = c.id) as video_count,
            (SELECT GROUP_CONCAT(ct.tenant_id) FROM category_tenants ct WHERE ct.category_id = c.id) as tenant_ids
        FROM categories c
        ${whereClause}
        ORDER BY display_order
    `;
    const result = await c.env.DB.prepare(query).bind(...params).all();

    // Parse tenant_ids string into array
    const categories = result.results.map((cat: any) => ({
        ...cat,
        tenant_ids: cat.tenant_ids ? cat.tenant_ids.split(',').map(Number) : []
    }));

    return c.json(categories);
})

app.post('/api/categories', async (c) => {
    const body = await c.req.json();
    const user = c.get('user');
    const tenantId = c.get('tenantId') || 0;

    const isGlobal = body.is_global !== undefined ? body.is_global : true;
    const channelId = isGlobal ? null : (user ? user.id : null);
    // Support array of tenant_ids or single tenantId
    // If is_global and no tenant_ids provided, default to [0] (Global Default)
    let tenantIds: number[] = body.tenant_ids || [tenantId];
    // Ensure tenant 0 (Global Default) is always included for global categories
    if (isGlobal && !tenantIds.includes(0)) {
        tenantIds.unshift(0);
    }

    const max = await c.env.DB.prepare('SELECT MAX(display_order) as m FROM categories').first();
    const nextOrder = (max?.m as number || 0) + 1;

    // Insert category with legacy tenant_id (first one for backwards compat)
    const result = await c.env.DB.prepare('INSERT INTO categories (name, display_order, is_global, channel_id, tenant_id) VALUES (?, ?, ?, ?, ?)')
        .bind(body.name, nextOrder, isGlobal, channelId, tenantIds[0] || 0).run();

    const categoryId = result.meta.last_row_id;

    // Insert into junction table for all tenant assignments
    for (const tid of tenantIds) {
        await c.env.DB.prepare('INSERT OR IGNORE INTO category_tenants (category_id, tenant_id) VALUES (?, ?)')
            .bind(categoryId, tid).run();
    }

    return c.json({ success: true, id: categoryId });
})

// Update category tenant assignments
app.put('/api/categories/:id/tenants', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.get('user');

    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const tenantIds: number[] = body.tenant_ids || [];

    // Delete existing tenant assignments
    await c.env.DB.prepare('DELETE FROM category_tenants WHERE category_id = ?').bind(id).run();

    // Insert new tenant assignments
    for (const tid of tenantIds) {
        await c.env.DB.prepare('INSERT INTO category_tenants (category_id, tenant_id) VALUES (?, ?)')
            .bind(id, tid).run();
    }

    // Update legacy tenant_id column (first one for backwards compat)
    await c.env.DB.prepare('UPDATE categories SET tenant_id = ? WHERE id = ?')
        .bind(tenantIds[0] || 0, id).run();

    return c.json({ success: true });
})

app.get('/api/playlists', async (c) => {
    const user = c.get('user');
    const tenantId = c.get('tenantId') || 0;
    const queryChannelId = c.req.query('channel_id');
    const includeAllTenants = c.req.query('all_tenants') === '1'; // Admin view
    const playlistType = c.req.query('type'); // 'playlist' = curated playlists only, 'channel' = channel uploads only

    let where: string[] = [];
    const params: any[] = [];

    // Tenant filter using junction table (unless admin wants all)
    if (!includeAllTenants) {
        where.push('EXISTS (SELECT 1 FROM playlist_tenants pt WHERE pt.playlist_id = p.id AND pt.tenant_id = ?)');
        params.push(tenantId);
    }

    // Filter by playlist type
    // source_channel_id starting with 'UC' = channel uploads
    // source_channel_id starting with 'PL', 'OL', etc. or NULL = curated playlists
    if (playlistType === 'playlist') {
        where.push("(p.source_channel_id IS NULL OR p.source_channel_id NOT LIKE 'UC%')");
    } else if (playlistType === 'channel') {
        where.push("p.source_channel_id LIKE 'UC%'");
    }

    if (queryChannelId) {
        where.push('(p.is_global = 1 OR p.channel_id = ?)');
        params.push(queryChannelId);
    } else if (user) {
        where.push('(p.is_global = 1 OR p.channel_id = ?)');
        params.push(user.id);
    } else {
        where.push('p.is_global = 1');
    }

    const whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    const query = `
        SELECT p.*,
            (SELECT GROUP_CONCAT(pt.tenant_id) FROM playlist_tenants pt WHERE pt.playlist_id = p.id) as tenant_ids
        FROM playlists p
        ${whereClause}
        ORDER BY p.display_order ASC
    `;
    const result = await c.env.DB.prepare(query).bind(...params).all();

    // Parse tenant_ids string into array
    const playlists = result.results.map((pl: any) => ({
        ...pl,
        tenant_ids: pl.tenant_ids ? pl.tenant_ids.split(',').map(Number) : []
    }));

    return c.json(playlists);
})

app.post('/api/playlists', async (c) => {
    const body = await c.req.json();
    const user = c.get('user');
    const tenantId = c.get('tenantId') || 0;

    const isGlobal = body.is_global !== undefined ? body.is_global : true;
    const channelId = isGlobal ? null : (user ? user.id : null);
    // Support array of tenant_ids or single tenantId
    const tenantIds: number[] = body.tenant_ids || [tenantId];

    const max = await c.env.DB.prepare('SELECT MAX(display_order) as m FROM playlists').first();
    const nextOrder = (max?.m as number || 0) + 1;

    // Insert playlist with legacy tenant_id (first one for backwards compat)
    const result = await c.env.DB.prepare('INSERT INTO playlists (name, display_order, is_global, channel_id, tenant_id) VALUES (?, ?, ?, ?, ?)')
        .bind(body.name, nextOrder, isGlobal, channelId, tenantIds[0] || 0).run();

    const playlistId = result.meta.last_row_id;

    // Insert into junction table for all tenant assignments
    for (const tid of tenantIds) {
        await c.env.DB.prepare('INSERT OR IGNORE INTO playlist_tenants (playlist_id, tenant_id) VALUES (?, ?)')
            .bind(playlistId, tid).run();
    }

    return c.json({ success: true, id: playlistId });
})

// Update playlist tenant assignments
app.put('/api/playlists/:id/tenants', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.get('user');

    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const tenantIds: number[] = body.tenant_ids || [];

    // Delete existing tenant assignments
    await c.env.DB.prepare('DELETE FROM playlist_tenants WHERE playlist_id = ?').bind(id).run();

    // Insert new tenant assignments
    for (const tid of tenantIds) {
        await c.env.DB.prepare('INSERT INTO playlist_tenants (playlist_id, tenant_id) VALUES (?, ?)')
            .bind(id, tid).run();
    }

    // Update legacy tenant_id column (first one for backwards compat)
    await c.env.DB.prepare('UPDATE playlists SET tenant_id = ? WHERE id = ?')
        .bind(tenantIds[0] || 0, id).run();

    return c.json({ success: true });
})

app.get('/api/videos', async (c) => {
    const cat = c.req.query('category_id');
    const pl = c.req.query('playlist_id');
    const queryChannelId = c.req.query('channel_id');
    const queryTenantId = c.req.query('tenant_id'); // Optional tenant filter from query
    const isVisibleFilter = c.req.query('is_visible'); // Optional visibility filter (0 or 1)
    const excludeImported = c.req.query('exclude_imported') === '1';
    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;

    const user = c.get('user'); // For admin/authenticated views
    const contextTenantId = c.get('tenantId') || 0; // From X-Tenant-Slug header/subdomain
    // Use query param tenant_id if provided (for admin filtering), otherwise use context
    const tenantId = queryTenantId !== undefined ? parseInt(queryTenantId) : contextTenantId;

    // Check if playlist or category is assigned to the current tenant (skip video-level tenant filter if so)
    let playlistAssignedToTenant = false;
    let categoryAssignedToTenant = false;
    if (pl && contextTenantId > 0) {
        const ptCheck = await c.env.DB.prepare(
            'SELECT 1 FROM playlist_tenants WHERE playlist_id = ? AND tenant_id = ?'
        ).bind(pl, contextTenantId).first();
        playlistAssignedToTenant = !!ptCheck;
    }
    if (cat && cat !== 'uncategorized' && contextTenantId > 0) {
        const ctCheck = await c.env.DB.prepare(
            'SELECT 1 FROM category_tenants WHERE category_id = ? AND tenant_id = ?'
        ).bind(cat, contextTenantId).first();
        categoryAssignedToTenant = !!ctCheck;
    }

    let baseQuery = `FROM videos v LEFT JOIN categories c ON v.category_id = c.id LEFT JOIN users ch ON v.channel_id = ch.id`;
    if (pl) {
        baseQuery += ` JOIN playlist_items pi ON v.id = pi.video_id `;
    }
    if (excludeImported) {
        baseQuery += ` LEFT JOIN users u ON v.channel_id = u.id `;
    }

    const params: any[] = [];
    const where: string[] = [];

    // TENANT FILTER: Filter videos by tenant_id
    // 1. If playlist/category is assigned to current tenant, skip video-level tenant filter
    // 2. If queryTenantId is explicitly provided (admin filtering), use it
    // 3. If contextTenantId > 0 (from subdomain/header), filter by that tenant
    // 4. If neither, show all videos (for admin "All Subdomains" view)
    if (playlistAssignedToTenant || categoryAssignedToTenant) {
        // Playlist/Category is assigned to this tenant - show all videos regardless of video tenant_id
        // (the playlist/category's tenant assignment controls visibility)
    } else if (queryTenantId !== undefined && queryTenantId !== '') {
        // Explicit query param - filter by specified tenant
        where.push('(v.tenant_id = ? OR v.tenant_id IS NULL)');
        params.push(tenantId);
    } else if (contextTenantId > 0) {
        // Subdomain/header tenant - filter by context tenant
        where.push('(v.tenant_id = ? OR v.tenant_id IS NULL)');
        params.push(contextTenantId);
    }
    // If no tenant filter, show all videos (admin view)

    // Filter by Scope (Global vs Channel)
    if (queryChannelId) {
        where.push('(v.is_global = 1 OR v.channel_id = ?)');
        params.push(queryChannelId);
    } else if (user) {
        // Admin sees global + theirs
        where.push('(v.is_global = 1 OR v.channel_id = ?)');
        params.push(user.id);
    } else {
        // Public default: Global only
        where.push('v.is_global = 1');
    }

    if (cat) {
        if (cat === 'uncategorized') {
            where.push('v.category_id IS NULL');
        } else {
            where.push('v.category_id = ?');
            params.push(cat);
        }
    }

    if (pl) {
        where.push('pi.playlist_id = ?');
        params.push(pl);
    }

    // Only exclude imported channel videos when NOT filtering by a specific playlist
    // When a playlist is selected, the user wants to see all videos in that playlist
    if (excludeImported && !pl) {
        // Exclude videos owned by imported channel users (email ends with @imported.kfytube)
        where.push("(u.email IS NULL OR u.email NOT LIKE '%@imported.kfytube')");
    }

    // VISIBILITY FILTER
    // If admin provides explicit is_visible filter (from VideosTab), use it
    if (isVisibleFilter !== undefined && isVisibleFilter !== '') {
        where.push('v.is_visible = ?');
        params.push(isVisibleFilter === '1' ? 1 : 0);
    } else if (!user) {
        // Otherwise, only show visible videos for non-admin/non-authenticated users
        where.push('v.is_visible = 1');
    }

    if (where.length > 0) {
        baseQuery += ' WHERE ' + where.join(' AND ');
    }

    // 1. Get Total Count
    const countQuery = `SELECT COUNT(*) as total ${baseQuery}`;
    const countRes = await c.env.DB.prepare(countQuery).bind(...params).first();
    const total = countRes?.total as number || 0;

    // 2. Get Data
    const dataQuery = `SELECT v.*, c.name as category_name, ch.channel_name as channel_name ${baseQuery} ORDER BY v.display_order ASC, v.created_at DESC LIMIT ? OFFSET ?`;
    const dataRes = await c.env.DB.prepare(dataQuery).bind(...params, limit, offset).all();

    return c.json({
        items: dataRes.results,
        total,
        page,
        limit,
        total_pages: Math.ceil(total / limit)
    });
})

app.post('/api/videos/bulk', async (c) => {
    const body = await c.req.json();
    const user = c.get('user');
    const contextTenantId = c.get('tenantId') || 0; // Get tenant from context

    const isGlobal = body.is_global !== undefined ? body.is_global : true;
    const channelId = isGlobal ? null : (user ? user.id : null);

    // Support multiple tenant_ids - if provided, insert video for each tenant
    // If not provided, use context tenant_id or 0 (global)
    const tenantIds: number[] = body.tenant_ids && Array.isArray(body.tenant_ids) && body.tenant_ids.length > 0
        ? body.tenant_ids
        : [contextTenantId];

    try {
        const insertVideo = c.env.DB.prepare('INSERT OR IGNORE INTO videos (youtube_id, title, category_id, is_global, channel_id, source_type, is_short, tenant_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

        // Create batch for each tenant_id
        const videoBatch: any[] = [];
        for (const tid of tenantIds) {
            for (const v of body.videos) {
                const catId = (v.category_id === "" || v.category_id === undefined) ? null : v.category_id;
                const sourceType = v.source_type || 'youtube';
                const isShort = v.is_short ? 1 : 0;
                videoBatch.push(insertVideo.bind(v.youtube_id, v.title, catId, isGlobal, channelId, sourceType, isShort, tid));
            }
        }
        await c.env.DB.batch(videoBatch);
    } catch (e) {
        // Fallback for when schema hasn't migrated yet (missing tenant_id column)
        console.error("New insert failed, trying legacy insert", e);
        const insertVideoLegacy = c.env.DB.prepare('INSERT OR IGNORE INTO videos (youtube_id, title, category_id, is_global, channel_id, source_type, is_short) VALUES (?, ?, ?, ?, ?, ?, ?)');
        const videoBatchLegacy = body.videos.map((v: any) => {
            const catId = (v.category_id === "" || v.category_id === undefined) ? null : v.category_id;
            const sourceType = v.source_type || 'youtube';
            const isShort = v.is_short ? 1 : 0;
            return insertVideoLegacy.bind(v.youtube_id, v.title, catId, isGlobal, channelId, sourceType, isShort);
        });
        await c.env.DB.batch(videoBatchLegacy);
    }

    if (body.playlist_id) {
        const placeholder = body.videos.map(() => '?').join(',');
        const ids = body.videos.map((v: any) => v.youtube_id);
        const videoRows = await c.env.DB.prepare(`SELECT id FROM videos WHERE youtube_id IN (${placeholder})`).bind(...ids).all();

        const insertPl = c.env.DB.prepare('INSERT OR IGNORE INTO playlist_items (playlist_id, video_id, sort_order) VALUES (?, ?, 0)');
        const plBatch = videoRows.results.map((v: any) => insertPl.bind(body.playlist_id, v.id));
        await c.env.DB.batch(plBatch);
    }

    return c.json({ success: true });
})

app.get('/api/videos/:id', async (c) => {
    const id = c.req.param('id');
    const video = await c.env.DB.prepare(`
        SELECT v.*, c.name as category_name, ch.channel_name as channel_name
        FROM videos v
        LEFT JOIN categories c ON v.category_id = c.id
        LEFT JOIN users ch ON v.channel_id = ch.id
        WHERE v.id = ?
    `).bind(id).first();
    if (!video) return c.json({ error: 'Video not found' }, 404);
    return c.json(video);
});

app.put('/api/videos/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.get('user');

    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Check ownership
    const video = await c.env.DB.prepare('SELECT channel_id FROM videos WHERE id = ?').bind(id).first();
    if (!video) return c.json({ error: 'Video not found' }, 404);

    if (user.id !== 1 && video.channel_id !== user.id) {
        return c.json({ error: 'Unauthorized to edit this video' }, 403);
    }

    // Support category update
    if (body.category_id) {
        await c.env.DB.prepare('UPDATE videos SET category_id = ? WHERE id = ?').bind(body.category_id, id).run();
    }
    // Support title update
    if (body.title) {
        await c.env.DB.prepare('UPDATE videos SET title = ? WHERE id = ?').bind(body.title, id).run();
    }

    return c.json({ success: true });
})

// Reorder endpoints need to remain, they are generic ID based

app.post('/api/categories/reorder', async (c) => {
    const body = await c.req.json();
    const stmt = c.env.DB.prepare('UPDATE categories SET display_order = ? WHERE id = ?');
    const batch = body.map((i: any) => stmt.bind(i.display_order, i.id));
    await c.env.DB.batch(batch);
    return c.json({ success: true });
})

app.post('/api/playlists/reorder', async (c) => {
    const body = await c.req.json();
    const stmt = c.env.DB.prepare('UPDATE playlists SET display_order = ? WHERE id = ?');
    const batch = body.map((i: any) => stmt.bind(i.display_order, i.id));
    await c.env.DB.batch(batch);
    return c.json({ success: true });
})

app.get('/api/users', async (c) => {
    // Only logged in
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Only Super Admin (ID 1) can see users
    if (user.id !== 1) return c.json({ error: 'Forbidden' }, 403);

    const result = await c.env.DB.prepare('SELECT id, email, channel_name, telegram_handle, tenant_id, created_at FROM users ORDER BY created_at DESC').all();
    return c.json(result.results);
})

app.put('/api/users/:id', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (user.id !== 1) return c.json({ error: 'Forbidden' }, 403);

    const id = c.req.param('id');
    const body = await c.req.json();

    if (body.channel_name !== undefined) {
        await c.env.DB.prepare('UPDATE users SET channel_name = ? WHERE id = ?').bind(body.channel_name, id).run();
    }
    if (body.email !== undefined) {
        await c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(body.email, id).run();
    }
    if (body.telegram_handle !== undefined) {
        // Normalize telegram handle: ensure it starts with @ if provided
        let handle = body.telegram_handle;
        if (handle && !handle.startsWith('@')) {
            handle = '@' + handle;
        }
        await c.env.DB.prepare('UPDATE users SET telegram_handle = ? WHERE id = ?').bind(handle || null, id).run();
    }

    return c.json({ success: true });
})

app.delete('/api/users/:id', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (user.id !== 1) return c.json({ error: 'Forbidden' }, 403);

    const id = c.req.param('id');

    // Prevent deleting self (admin)
    if (parseInt(id) === user.id) {
        return c.json({ error: 'Cannot delete yourself' }, 400);
    }

    // Delete user's videos from playlists first
    const userVideos = await c.env.DB.prepare('SELECT id FROM videos WHERE channel_id = ?').bind(id).all();
    if (userVideos.results.length > 0) {
        const videoIds = userVideos.results.map((v: any) => v.id);
        const placeholders = videoIds.map(() => '?').join(',');
        await c.env.DB.prepare(`DELETE FROM playlist_items WHERE video_id IN (${placeholders})`).bind(...videoIds).run();
    }

    // Delete user's videos
    await c.env.DB.prepare('DELETE FROM videos WHERE channel_id = ?').bind(id).run();

    // Delete user's playlists and their items
    const userPlaylists = await c.env.DB.prepare('SELECT id FROM playlists WHERE channel_id = ?').bind(id).all();
    for (const pl of userPlaylists.results) {
        await c.env.DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').bind((pl as any).id).run();
    }
    await c.env.DB.prepare('DELETE FROM playlists WHERE channel_id = ?').bind(id).run();

    // Delete user's categories (videos already deleted)
    await c.env.DB.prepare('DELETE FROM categories WHERE channel_id = ?').bind(id).run();

    // Finally delete user
    await c.env.DB.prepare('DELETE FROM users WHERE id = ?').bind(id).run();

    return c.json({ success: true });
})

app.post('/api/videos/reorder', async (c) => {
    const body = await c.req.json();
    const stmt = c.env.DB.prepare('UPDATE videos SET display_order = ? WHERE id = ?');
    const batch = body.map((i: any) => stmt.bind(i.display_order, i.id));
    await c.env.DB.batch(batch);
    return c.json({ success: true });
})


// Standard Entity Deletes
app.delete('/api/categories/:id', async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const cat = await c.env.DB.prepare('SELECT channel_id FROM categories WHERE id = ?').bind(id).first();
    if (!cat) return c.json({ error: 'Not found' }, 404);

    if (user.id !== 1 && cat.channel_id !== user.id) {
        return c.json({ error: 'Unauthorized to delete this category' }, 403);
    }

    const vidRows = await c.env.DB.prepare('SELECT id FROM videos WHERE category_id = ?').bind(id).all();
    const videoIds = vidRows.results.map((v: any) => v.id);
    if (videoIds.length > 0) {
        const placeholders = videoIds.map(() => '?').join(',');
        await c.env.DB.prepare(`DELETE FROM playlist_items WHERE video_id IN (${placeholders})`).bind(...videoIds).run();
        await c.env.DB.prepare('DELETE FROM videos WHERE category_id = ?').bind(id).run();
    }
    await c.env.DB.prepare('DELETE FROM categories WHERE id = ?').bind(id).run();
    return c.json({ success: true });
})

app.delete('/api/playlists/:id', async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const pl = await c.env.DB.prepare('SELECT channel_id FROM playlists WHERE id = ?').bind(id).first();
    if (!pl) return c.json({ error: 'Not found' }, 404);

    if (user.id !== 1 && pl.channel_id !== user.id) {
        return c.json({ error: 'Unauthorized to delete this playlist' }, 403);
    }

    await c.env.DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').bind(id).run();
    await c.env.DB.prepare('DELETE FROM playlists WHERE id = ?').bind(id).run();
    return c.json({ success: true });
})

// Remove a video from a playlist
app.delete('/api/playlists/:playlistId/videos/:videoId', async (c) => {
    const playlistId = c.req.param('playlistId');
    const videoId = c.req.param('videoId');
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    // Verify playlist ownership
    const pl = await c.env.DB.prepare('SELECT channel_id FROM playlists WHERE id = ?').bind(playlistId).first();
    if (!pl) return c.json({ error: 'Playlist not found' }, 404);

    if (user.id !== 1 && pl.channel_id !== user.id) {
        return c.json({ error: 'Unauthorized' }, 403);
    }

    await c.env.DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ? AND video_id = ?')
        .bind(playlistId, videoId).run();

    return c.json({ success: true });
})

app.put('/api/categories/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const cat = await c.env.DB.prepare('SELECT channel_id FROM categories WHERE id = ?').bind(id).first();
    if (!cat) return c.json({ error: 'Not found' }, 404);

    if (user.id !== 1 && cat.channel_id !== user.id) {
        return c.json({ error: 'Unauthorized to edit this category' }, 403);
    }

    if (body.name) {
        await c.env.DB.prepare('UPDATE categories SET name = ? WHERE id = ?').bind(body.name, id).run();
    }
    if (body.is_featured !== undefined) {
        await c.env.DB.prepare('UPDATE categories SET is_featured = ? WHERE id = ?').bind(body.is_featured ? 1 : 0, id).run();
    }
    if (body.repeat_enabled !== undefined) {
        await c.env.DB.prepare('UPDATE categories SET repeat_enabled = ? WHERE id = ?').bind(body.repeat_enabled ? 1 : 0, id).run();
    }
    return c.json({ success: true });
})

// Featured categories with their 10 most recent videos each
app.get('/api/categories/featured', async (c) => {
    const tenantId = c.get('tenantId') || 0;

    const cats = await c.env.DB.prepare(`
        SELECT c.id, c.name FROM categories c
        WHERE c.is_featured = 1
          AND EXISTS (SELECT 1 FROM category_tenants ct WHERE ct.category_id = c.id AND ct.tenant_id = ?)
        ORDER BY c.display_order ASC
    `).bind(tenantId).all();

    const featured: any[] = [];
    for (const cat of cats.results) {
        const videos = await c.env.DB.prepare(`
            SELECT v.id, v.title, v.youtube_id, v.source_type, v.is_short, v.duration, v.view_count, v.published_at, v.thumbnail_url,
                   c.name as category_name
            FROM videos v
            LEFT JOIN categories c ON v.category_id = c.id
            WHERE v.category_id = ? AND v.is_global = 1
            ORDER BY v.created_at DESC LIMIT 10
        `).bind((cat as any).id).all();

        // Only include categories that actually have videos
        if (videos.results.length > 0) {
            featured.push({
                id: (cat as any).id,
                name: (cat as any).name,
                videos: videos.results
            });
        }
    }

    return c.json(featured);
})

app.put('/api/playlists/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const pl = await c.env.DB.prepare('SELECT channel_id FROM playlists WHERE id = ?').bind(id).first();
    if (!pl) return c.json({ error: 'Not found' }, 404);

    if (user.id !== 1 && pl.channel_id !== user.id) {
        return c.json({ error: 'Unauthorized to edit this playlist' }, 403);
    }

    if (body.name) {
        await c.env.DB.prepare('UPDATE playlists SET name = ? WHERE id = ?').bind(body.name, id).run();
    }
    if (body.is_featured !== undefined) {
        await c.env.DB.prepare('UPDATE playlists SET is_featured = ? WHERE id = ?').bind(body.is_featured, id).run();
    }
    if (body.repeat_enabled !== undefined) {
        await c.env.DB.prepare('UPDATE playlists SET repeat_enabled = ? WHERE id = ?').bind(body.repeat_enabled ? 1 : 0, id).run();
    }
    return c.json({ success: true });
})

app.get('/api/fetch-video-info', async (c) => {
    const id = c.req.query('id');
    if (!id) return c.json({ error: 'Missing id' }, 400);
    try {
        const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
        if (res.ok) {
            const data: any = await res.json();
            return c.json({ title: data.title });
        }
    } catch (e) { }
    return c.json({ title: `Video ${id}` });
})

app.get('/api/channels', async (c) => {
    // Public endpoint to list available channels (exclude imported YouTube channel users)
    const result = await c.env.DB.prepare(`
        SELECT id, channel_name
        FROM users
        WHERE channel_name IS NOT NULL
        AND email NOT LIKE '%@imported.kfytube'
        ORDER BY channel_name ASC
    `).all();
    return c.json(result.results);
})

// --- COMMENTS API ---

// Get comments for a video (public)
app.get('/api/videos/:videoId/comments', async (c) => {
    const videoId = c.req.param('videoId');
    const tenantId = c.get('tenantId') || 0;

    try {
        const result = await c.env.DB.prepare(`
            SELECT id, author_name, content, created_at
            FROM comments
            WHERE video_id = ? AND (tenant_id = ? OR tenant_id = 0)
            ORDER BY created_at DESC
            LIMIT 100
        `).bind(videoId, tenantId).all();

        return c.json(result.results || []);
    } catch (e) {
        // Table might not exist yet
        return c.json([]);
    }
})

// Post a comment (public, no auth required)
app.post('/api/videos/:videoId/comments', async (c) => {
    const videoId = c.req.param('videoId');
    const tenantId = c.get('tenantId') || 0;
    const body = await c.req.json();

    if (!body.author_name || !body.content) {
        return c.json({ error: 'Author name and content are required' }, 400);
    }

    // Basic validation
    const authorName = body.author_name.trim().slice(0, 50);
    const content = body.content.trim().slice(0, 1000);

    if (authorName.length < 1 || content.length < 1) {
        return c.json({ error: 'Author name and content cannot be empty' }, 400);
    }

    try {
        const result: any = await c.env.DB.prepare(`
            INSERT INTO comments (video_id, author_name, content, tenant_id)
            VALUES (?, ?, ?, ?)
            RETURNING id, author_name, content, created_at
        `).bind(videoId, authorName, content, tenantId).first();

        return c.json(result);
    } catch (e) {
        console.error('Failed to insert comment', e);
        return c.json({ error: 'Failed to post comment' }, 500);
    }
})

// Admin endpoint to update imported channel names
app.post('/api/channels/refresh-names', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);
    if (user.id !== 1) return c.json({ error: 'Admin only' }, 403);

    // Find all imported channel users with UC... names
    const channels = await c.env.DB.prepare(`
        SELECT id, email, channel_name
        FROM users
        WHERE email LIKE '%@imported.kfytube'
        AND (channel_name LIKE 'UC%' OR LENGTH(channel_name) = 24)
    `).all();

    let updated = 0;
    for (const ch of channels.results as any[]) {
        // Extract channel ID from email
        const channelId = ch.email.replace('@imported.kfytube', '');
        if (channelId.startsWith('UC')) {
            const newName = await fetchChannelName(channelId);
            if (newName && newName !== channelId) {
                await c.env.DB.prepare('UPDATE users SET channel_name = ? WHERE id = ?')
                    .bind(newName, ch.id).run();
                // Also update the playlist name
                await c.env.DB.prepare('UPDATE playlists SET name = ? WHERE source_channel_id = ?')
                    .bind(`${newName} - ${channelId}`, channelId).run();
                updated++;
            }
        }
    }

    return c.json({ success: true, updated });
})

app.delete('/api/videos/:id', async (c) => {
    const id = c.req.param('id');
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const video = await c.env.DB.prepare('SELECT channel_id FROM videos WHERE id = ?').bind(id).first();
    if (!video) return c.json({ error: 'Not found' }, 404);

    if (user.id !== 1 && video.channel_id !== user.id) {
        return c.json({ error: 'Unauthorized to delete this video' }, 403);
    }

    // 1. Delete from playlist_items first
    await c.env.DB.prepare('DELETE FROM playlist_items WHERE video_id = ?').bind(id).run();
    // 2. Delete video
    await c.env.DB.prepare('DELETE FROM videos WHERE id = ?').bind(id).run();
    return c.json({ success: true });
})

// --- YOUTUBE HELPERS ---

// Fetch YouTube channel name from multiple sources
async function fetchChannelName(channelId: string): Promise<string | null> {
    // 1. Try Invidious instances
    const instances = [
        'https://inv.tux.pizza',
        'https://vid.puffyan.us',
        'https://invidious.projectsegfau.lt'
    ];

    for (const host of instances) {
        try {
            const res = await fetch(`${host}/api/v1/channels/${channelId}`, {
                headers: { 'User-Agent': 'KfyTube/1.0' }
            });
            if (res.ok) {
                const info: any = await res.json();
                if (info.author && info.author !== channelId) {
                    return info.author;
                }
            }
        } catch (e) { /* Continue to next instance */ }
    }

    // 2. Try YouTube RSS feed (has channel title in <author><name>)
    try {
        const rssRes = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
        if (rssRes.ok) {
            const text = await rssRes.text();
            // Extract author name: <author><name>Channel Name</name>
            const authorMatch = /<author>\s*<name>([^<]+)<\/name>/.exec(text);
            if (authorMatch && authorMatch[1] && authorMatch[1] !== channelId) {
                return authorMatch[1];
            }
        }
    } catch (e) { /* Continue */ }

    // 3. Try scraping YouTube channel page
    try {
        const res = await fetch(`https://www.youtube.com/channel/${channelId}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                'Accept-Language': 'en-US,en;q=0.9'
            }
        });
        if (res.ok) {
            const text = await res.text();
            // Look for channel name in meta or JSON
            const patterns = [
                /"name":"([^"]+)","alternateName"/,
                /<meta property="og:title" content="([^"]+)">/,
                /"channelName":"([^"]+)"/
            ];
            for (const p of patterns) {
                const m = p.exec(text);
                if (m && m[1] && m[1] !== channelId && !m[1].startsWith('UC')) {
                    return m[1];
                }
            }
        }
    } catch (e) { /* Fallback to null */ }

    return null;
}

async function resolveChannelId(input: string) {
    if (input.startsWith('UC') && input.length >= 24) return input;

    // Explicitly handle Handles constructs if they aren't full URLs yet
    let targetUrl = input;
    if (input.startsWith('@')) {
        targetUrl = `https://www.youtube.com/${input}`;
    } else if (!input.includes('youtube.com/') && !input.includes('youtu.be/')) {
        // Assume it's a handle if not a URL and not a UC ID
        targetUrl = `https://www.youtube.com/@${input}`;
    }

    if (targetUrl.includes('youtube.com/') || targetUrl.includes('youtu.be/')) {
        try {
            console.log(`Scraping ${targetUrl} for ID...`);
            const res = await fetch(targetUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Accept-Language': 'en-US,en;q=0.9'
                }
            });
            if (res.ok) {
                const text = await res.text();
                // Primary Method: channel_id=UC...
                const simpleMatch = /channel_id=(UC[\w-]+)/.exec(text);
                if (simpleMatch && simpleMatch[1]) return simpleMatch[1];

                // Backup Patterns from HTML source
                const patterns = [
                    /"externalId":"(UC[\w-]+)"/,
                    /"channelId":"(UC[\w-]+)"/,
                    /"browseId":"(UC[\w-]+)"/,
                    /<meta itemprop="channelId" content="(UC[\w-]+)">/
                ];

                for (const p of patterns) {
                    const m = p.exec(text);
                    if (m && m[1]) return m[1];
                }
            }
        } catch (e) { console.error("Scrape failed", e); }
    }

    return null;
}

async function fetchRSSVideos(channelId: string) {
    try {
        console.log(`Fetching RSS for ${channelId}...`);
        const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
        if (res.ok) {
            const text = await res.text();
            const videos: any[] = [];
            const regex = /<entry>([\s\S]*?)<\/entry>/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                const content = match[1];
                const vidMatch = /<yt:videoId>(.*?)<\/yt:videoId>/.exec(content);
                const titleMatch = /<title>(.*?)<\/title>/.exec(content);
                if (vidMatch && titleMatch) {
                    videos.push({
                        id: vidMatch[1],
                        title: titleMatch[1]
                    });
                }
            }
            return videos;
        }
    } catch (e) { console.error("RSS Fetch Error", e); }
    return null;
}

// Fetch videos from a YouTube playlist using RSS feed
async function fetchPlaylistVideos(playlistId: string): Promise<{ videos: any[], title: string } | null> {
    try {
        console.log(`Fetching playlist RSS for ${playlistId}...`);
        const res = await fetch(`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`);
        if (res.ok) {
            const text = await res.text();
            const videos: any[] = [];

            // Extract playlist title
            const playlistTitleMatch = /<title>(.*?)<\/title>/.exec(text);
            const playlistTitle = playlistTitleMatch ? playlistTitleMatch[1] : `Playlist ${playlistId}`;

            // Extract videos from entries
            const regex = /<entry>([\s\S]*?)<\/entry>/g;
            let match;
            while ((match = regex.exec(text)) !== null) {
                const content = match[1];
                const vidMatch = /<yt:videoId>(.*?)<\/yt:videoId>/.exec(content);
                const titleMatch = /<media:title>(.*?)<\/media:title>/.exec(content) || /<title>(.*?)<\/title>/.exec(content);
                if (vidMatch && titleMatch) {
                    videos.push({
                        id: vidMatch[1],
                        title: titleMatch[1]
                    });
                }
            }

            if (videos.length > 0) {
                return { videos, title: playlistTitle };
            }
        }
    } catch (e) {
        console.error("Playlist RSS Fetch Error", e);
    }
    return null;
}

// ============================================
// YouTube Data API v3 Helpers
// ============================================

interface YouTubeVideoDetails {
    id: string;
    title: string;
    description?: string;
    duration?: string;           // ISO 8601 (PT4M30S)
    viewCount?: number;
    likeCount?: number;
    publishedAt?: string;
    madeForKids?: boolean;
    isShort?: boolean;
    thumbnailUrl?: string;
}

// Parse ISO 8601 duration to seconds
function parseISODuration(isoDuration: string): number {
    const match = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(isoDuration);
    if (!match) return 0;
    const hours = parseInt(match[1] || '0', 10);
    const minutes = parseInt(match[2] || '0', 10);
    const seconds = parseInt(match[3] || '0', 10);
    return hours * 3600 + minutes * 60 + seconds;
}

// Get channel's uploads playlist ID
async function getChannelUploadsPlaylistId(channelId: string, apiKey: string): Promise<string | null> {
    try {
        const url = `https://www.googleapis.com/youtube/v3/channels?part=contentDetails&id=${channelId}&key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`YouTube API error: ${res.status}`);
            return null;
        }
        const data: any = await res.json();
        if (data.items && data.items.length > 0) {
            return data.items[0].contentDetails.relatedPlaylists.uploads;
        }
    } catch (e) {
        console.error('getChannelUploadsPlaylistId error:', e);
    }
    return null;
}

// Get videos from a playlist (uploads playlist)
async function getPlaylistVideoIds(playlistId: string, apiKey: string, maxResults: number = 50): Promise<string[]> {
    const videoIds: string[] = [];
    try {
        const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&playlistId=${playlistId}&maxResults=${maxResults}&key=${apiKey}`;
        const res = await fetch(url);
        if (!res.ok) {
            console.error(`YouTube API playlist error: ${res.status}`);
            return videoIds;
        }
        const data: any = await res.json();
        if (data.items) {
            for (const item of data.items) {
                videoIds.push(item.contentDetails.videoId);
            }
        }
    } catch (e) {
        console.error('getPlaylistVideoIds error:', e);
    }
    return videoIds;
}

// Get detailed video information (stats, madeForKids, duration)
async function getVideoDetails(videoIds: string[], apiKey: string): Promise<YouTubeVideoDetails[]> {
    const details: YouTubeVideoDetails[] = [];
    if (videoIds.length === 0) return details;

    try {
        // Batch up to 50 videos per request
        const batchedIds = [];
        for (let i = 0; i < videoIds.length; i += 50) {
            batchedIds.push(videoIds.slice(i, i + 50));
        }

        for (const batch of batchedIds) {
            const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics,status&id=${batch.join(',')}&key=${apiKey}`;
            const res = await fetch(url);
            if (!res.ok) {
                console.error(`YouTube API videos error: ${res.status}`);
                continue;
            }
            const data: any = await res.json();
            if (data.items) {
                for (const item of data.items) {
                    const durationSec = parseISODuration(item.contentDetails?.duration || 'PT0S');
                    details.push({
                        id: item.id,
                        title: item.snippet?.title || '',
                        description: item.snippet?.description || '',
                        duration: item.contentDetails?.duration,
                        viewCount: parseInt(item.statistics?.viewCount || '0', 10),
                        likeCount: parseInt(item.statistics?.likeCount || '0', 10),
                        publishedAt: item.snippet?.publishedAt,
                        madeForKids: item.status?.madeForKids === true,
                        isShort: durationSec <= 60 && durationSec > 0,  // Shorts are typically <= 60 seconds
                        thumbnailUrl: item.snippet?.thumbnails?.medium?.url || item.snippet?.thumbnails?.default?.url
                    });
                }
            }
        }
    } catch (e) {
        console.error('getVideoDetails error:', e);
    }
    return details;
}

// Fetch channel videos using YouTube API (with stats and madeForKids)
async function fetchChannelVideosWithAPI(channelId: string, apiKey: string, maxResults: number = 50): Promise<YouTubeVideoDetails[]> {
    // Get uploads playlist ID
    const uploadsPlaylistId = await getChannelUploadsPlaylistId(channelId, apiKey);
    if (!uploadsPlaylistId) {
        console.log('Could not get uploads playlist for channel:', channelId);
        return [];
    }

    // Get video IDs from uploads playlist
    const videoIds = await getPlaylistVideoIds(uploadsPlaylistId, apiKey, maxResults);
    if (videoIds.length === 0) {
        console.log('No videos found in uploads playlist');
        return [];
    }

    // Get detailed video info
    return await getVideoDetails(videoIds, apiKey);
}

async function fetchChannelVideos(channelId: string) {
    // 1. Try RSS First (Fastest, direct from source)
    const rssVideos = await fetchRSSVideos(channelId);
    if (rssVideos && rssVideos.length > 0) return rssVideos;

    // 2. Try Invidious Instances (Fallback for older/popular videos if RSS fails)
    const instances = [
        'https://inv.tux.pizza',
        'https://vid.puffyan.us',
        'https://invidious.projectsegfau.lt'
    ];

    for (const host of instances) {
        try {
            console.log(`Trying ${host}...`);
            const res = await fetch(`${host}/api/v1/channels/${channelId}/videos?sort_by=popular&page=1`);
            if (res.ok) {
                const data: any = await res.json();
                return data.map((v: any) => ({
                    id: v.videoId,
                    title: v.title,
                }));
            }
        } catch (e) { console.error(`Failed ${host}`, e); }
    }

    return null;
}

app.post('/api/playlists/import', async (c) => {
    const body = await c.req.json();
    let channelInput = body.channel_id;
    const user = c.get('user');

    if (!channelInput) return c.json({ error: 'Channel ID or URL required' }, 400);

    const channelId = await resolveChannelId(channelInput);
    if (!channelId) {
        console.error(`Failed to resolve: ${channelInput}`);
        return c.json({ error: `Could not resolve Channel ID. Please try entering the Channel ID (starts with UC...) directly.` }, 404);
    }

    const videos = await fetchChannelVideos(channelId);
    if (!videos || videos.length === 0) return c.json({ error: 'Failed to fetch videos. Check ID or try later.' }, 500);

    // Create Playlist - fetch proper channel name
    let channelName = await fetchChannelName(channelId) || channelId;
    let playlistName = `${channelName} - ${channelId}`;

    // Find or Create Channel User
    const channelEmail = `${channelId}@imported.kfytube`;
    let channelUser: any = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(channelEmail).first();

    if (!channelUser) {
        // Create new user for this channel
        channelUser = await c.env.DB.prepare('INSERT INTO users (email, channel_name, tenant_id) VALUES (?, ?, 0) RETURNING id')
            .bind(channelEmail, channelName).first();
    }
    const targetChannelId = channelUser.id;

    // Check if Playlist already exists for this channel
    let playlistId;
    let isNew = false;
    const existingPl: any = await c.env.DB.prepare('SELECT id FROM playlists WHERE source_channel_id = ?').bind(channelId).first();

    if (existingPl) {
        // Reuse existing
        playlistId = existingPl.id;
    } else {
        // Create New
        const max = await c.env.DB.prepare('SELECT MAX(display_order) as m FROM playlists').first();
        const nextOrder = (max?.m as number || 0) + 1;

        const plResult: any = await c.env.DB.prepare('INSERT INTO playlists (name, display_order, is_global, channel_id, source_channel_id) VALUES (?, ?, 1, ?, ?) RETURNING id')
            .bind(playlistName, nextOrder, user ? user.id : 1, channelId).first();
        playlistId = plResult.id;
        isNew = true;

        // Add to playlist_tenants for global visibility
        await c.env.DB.prepare('INSERT OR IGNORE INTO playlist_tenants (playlist_id, tenant_id) VALUES (?, 0)').bind(playlistId).run();
    }

    // Insert Videos & Playlist Items
    // LINK TO CHANNEL ID
    const insertVideo = c.env.DB.prepare('INSERT OR IGNORE INTO videos (youtube_id, title, is_global, channel_id, source_type) VALUES (?, ?, 1, ?, "youtube")');
    const videoBatch = videos.map((v: any) => insertVideo.bind(v.id, v.title, targetChannelId));
    await c.env.DB.batch(videoBatch);

    // Now link them
    const placeholders = videos.map(() => '?').join(',');
    const ids = videos.map((v: any) => v.id);
    const videoRows = await c.env.DB.prepare(`SELECT id, youtube_id FROM videos WHERE youtube_id IN (${placeholders})`).bind(...ids).all();

    const videoIdMap = new Map();
    videoRows.results.forEach((r: any) => videoIdMap.set(r.youtube_id, r.id));

    // For existing playlists, we want to append/merge, or maybe just ensure they are there.
    // Simplest approach: "INSERT OR IGNORE" into playlist_items.
    // Note: This won't re-order existing items, but will append new ones if display_order isn't managed strictly.
    // For a cleaner "Feed" sync, we might want to ensure they are at the top?
    // Let's just stick to "INSERT OR IGNORE" to avoid duplicates.

    // Check existing items to determine sort order if needed? 
    // For now, simple append logic (using index as basic order) might conflict if reusing index 0-50.
    // Better: Get current max sort_order for this playlist
    const maxSort = await c.env.DB.prepare('SELECT MAX(sort_order) as m FROM playlist_items WHERE playlist_id = ?').bind(playlistId).first();
    let currentSort = (maxSort?.m as number || 0) + 1;
    if (isNew) currentSort = 0; // Reset for new

    const insertPl = c.env.DB.prepare('INSERT OR IGNORE INTO playlist_items (playlist_id, video_id, sort_order) VALUES (?, ?, ?)');
    const plBatch: any[] = [];

    videos.forEach((v: any, index: number) => {
        const internalId = videoIdMap.get(v.id);
        if (internalId) {
            // Check if already in playlist to avoid weird sort order increments? 
            // "INSERT OR IGNORE" handles the PK constraint (playlist_id, video_id).
            // But we need to supply a sort_order.
            // If we supply a new sort_order for an existing item, it won't be updated (IGNORE).
            // That is fine.
            plBatch.push(insertPl.bind(playlistId, internalId, currentSort + index));
        }
    });

    if (plBatch.length > 0) await c.env.DB.batch(plBatch);

    return c.json({ success: true, count: videos.length, playlist_id: playlistId, reused: !isNew });
});

// Bulk import endpoint - receives pre-fetched data from client to reduce worker usage
app.post('/api/playlists/import-bulk', async (c) => {
    const body = await c.req.json();
    const { channel_id: channelId, channel_name: channelName, videos } = body;
    const user = c.get('user');

    if (!channelId || !videos || !Array.isArray(videos) || videos.length === 0) {
        return c.json({ error: 'channel_id and videos array required' }, 400);
    }

    // Find or Create Channel User
    const channelEmail = `${channelId}@imported.kfytube`;
    let channelUser: any = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(channelEmail).first();

    if (!channelUser) {
        channelUser = await c.env.DB.prepare('INSERT INTO users (email, channel_name, tenant_id) VALUES (?, ?, 0) RETURNING id')
            .bind(channelEmail, channelName || channelId).first();
    }
    const targetChannelId = channelUser.id;

    // Playlist name format: "ChannelName - ChannelID"
    const playlistName = `${channelName || channelId} - ${channelId}`;

    // Check if Playlist already exists for this channel
    let playlistId;
    let isNew = false;
    const existingPl: any = await c.env.DB.prepare('SELECT id FROM playlists WHERE source_channel_id = ?').bind(channelId).first();

    if (existingPl) {
        playlistId = existingPl.id;
    } else {
        const max = await c.env.DB.prepare('SELECT MAX(display_order) as m FROM playlists').first();
        const nextOrder = (max?.m as number || 0) + 1;

        const plResult: any = await c.env.DB.prepare('INSERT INTO playlists (name, display_order, is_global, channel_id, source_channel_id) VALUES (?, ?, 1, ?, ?) RETURNING id')
            .bind(playlistName, nextOrder, user ? user.id : 1, channelId).first();
        playlistId = plResult.id;
        isNew = true;

        // Add to playlist_tenants for global visibility
        await c.env.DB.prepare('INSERT OR IGNORE INTO playlist_tenants (playlist_id, tenant_id) VALUES (?, 0)').bind(playlistId).run();
    }

    // Insert Videos
    const insertVideo = c.env.DB.prepare('INSERT OR IGNORE INTO videos (youtube_id, title, is_global, channel_id, source_type) VALUES (?, ?, 1, ?, "youtube")');
    const videoBatch = videos.map((v: any) => insertVideo.bind(v.id, v.title, targetChannelId));
    await c.env.DB.batch(videoBatch);

    // Link to playlist
    const placeholders = videos.map(() => '?').join(',');
    const ids = videos.map((v: any) => v.id);
    const videoRows = await c.env.DB.prepare(`SELECT id, youtube_id FROM videos WHERE youtube_id IN (${placeholders})`).bind(...ids).all();

    const videoIdMap = new Map();
    videoRows.results.forEach((r: any) => videoIdMap.set(r.youtube_id, r.id));

    const maxSort = await c.env.DB.prepare('SELECT MAX(sort_order) as m FROM playlist_items WHERE playlist_id = ?').bind(playlistId).first();
    let currentSort = (maxSort?.m as number || 0) + 1;
    if (isNew) currentSort = 0;

    const insertPl = c.env.DB.prepare('INSERT OR IGNORE INTO playlist_items (playlist_id, video_id, sort_order) VALUES (?, ?, ?)');
    const plBatch: any[] = [];

    videos.forEach((v: any, index: number) => {
        const internalId = videoIdMap.get(v.id);
        if (internalId) {
            plBatch.push(insertPl.bind(playlistId, internalId, currentSort + index));
        }
    });

    if (plBatch.length > 0) await c.env.DB.batch(plBatch);

    return c.json({ success: true, count: videos.length, playlist_id: playlistId, reused: !isNew });
});

app.post('/api/playlists/:id/refresh', async (c) => {
    const id = c.req.param('id');
    const pl = await c.env.DB.prepare('SELECT * FROM playlists WHERE id = ?').bind(id).first();
    if (!pl || !pl.source_channel_id) return c.json({ error: 'Not an imported playlist' }, 400);

    const videos = await fetchChannelVideos(pl.source_channel_id as string);
    if (!videos) return c.json({ error: 'Fetch failed' }, 500);

    // Resolve Channel User (Lazy creation/lookup)
    const channelEmail = `${pl.source_channel_id}@imported.kfytube`;
    let channelUser: any = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(channelEmail).first();

    // If missing (maybe imported before this patch), create it now
    if (!channelUser) {
        let name = pl.name.replace('Best of ', '').replace('Channel ', ''); // best effort guess from playlist name
        // Try fetch if needed, but for speed, let's just use what we have or placeholder
        if (name === pl.source_channel_id) name = 'Imported Channel';
        channelUser = await c.env.DB.prepare('INSERT INTO users (email, channel_name, tenant_id) VALUES (?, ?, 0) RETURNING id')
            .bind(channelEmail, name).first();
    }
    const targetChannelId = channelUser.id;

    const insertVideo = c.env.DB.prepare('INSERT OR IGNORE INTO videos (youtube_id, title, is_global, channel_id, source_type) VALUES (?, ?, 1, ?, "youtube")');
    const videoBatch = videos.map((v: any) => insertVideo.bind(v.id, v.title, targetChannelId));
    await c.env.DB.batch(videoBatch);

    const placeholders = videos.map(() => '?').join(',');
    const ids = videos.map((v: any) => v.id);
    const videoRows = await c.env.DB.prepare(`SELECT id, youtube_id FROM videos WHERE youtube_id IN (${placeholders})`).bind(...ids).all();
    const videoIdMap = new Map();
    videoRows.results.forEach((r: any) => videoIdMap.set(r.youtube_id, r.id));

    // Clear & Refill for Sync
    await c.env.DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').bind(id).run();

    const insertPl = c.env.DB.prepare('INSERT OR IGNORE INTO playlist_items (playlist_id, video_id, sort_order) VALUES (?, ?, ?)');
    const plBatch: any[] = [];
    videos.forEach((v: any, index: number) => {
        const internalId = videoIdMap.get(v.id);
        if (internalId) {
            plBatch.push(insertPl.bind(id, internalId, index));
        }
    });
    if (plBatch.length > 0) await c.env.DB.batch(plBatch);

    return c.json({ success: true, count: videos.length });
});

// --- TENANT MANAGEMENT API ---

// List all tenants (admin only)
app.get('/api/tenants', async (c) => {
    const user = c.get('user');
    // Only global admins (tenant_id = 0) can list all tenants
    // For now, allow any authenticated user to view

    const result = await c.env.DB.prepare(`
        SELECT t.*,
            (SELECT COUNT(*) FROM videos WHERE tenant_id = t.id) as video_count,
            (SELECT COUNT(*) FROM users WHERE tenant_id = t.id) as user_count
        FROM tenants t
        ORDER BY t.name ASC
    `).all();

    return c.json(result.results);
});

// Get single tenant
app.get('/api/tenants/:id', async (c) => {
    const id = c.req.param('id');
    const tenant = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first();
    if (!tenant) return c.json({ error: 'Tenant not found' }, 404);
    return c.json(tenant);
});

// Create tenant (admin only)
app.post('/api/tenants', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const body = await c.req.json();
    if (!body.slug || !body.name) {
        return c.json({ error: 'slug and name are required' }, 400);
    }

    // Validate slug format (lowercase, alphanumeric, hyphens only)
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(body.slug)) {
        return c.json({ error: 'slug must be lowercase alphanumeric with hyphens only' }, 400);
    }

    // Check if slug exists
    const existing = await c.env.DB.prepare('SELECT id FROM tenants WHERE slug = ?').bind(body.slug).first();
    if (existing) {
        return c.json({ error: 'Tenant with this slug already exists' }, 409);
    }

    const result = await c.env.DB.prepare(
        'INSERT INTO tenants (slug, name, description) VALUES (?, ?, ?) RETURNING *'
    ).bind(body.slug, body.name, body.description || null).first();

    return c.json(result);
});

// Update tenant
app.put('/api/tenants/:id', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');
    const body = await c.req.json();

    const updates: string[] = [];
    const params: any[] = [];

    if (body.name) {
        updates.push('name = ?');
        params.push(body.name);
    }
    if (body.description !== undefined) {
        updates.push('description = ?');
        params.push(body.description);
    }
    if (body.is_active !== undefined) {
        updates.push('is_active = ?');
        params.push(body.is_active ? 1 : 0);
    }

    if (updates.length === 0) {
        return c.json({ error: 'No fields to update' }, 400);
    }

    params.push(id);
    await c.env.DB.prepare(`UPDATE tenants SET ${updates.join(', ')} WHERE id = ?`).bind(...params).run();

    const tenant = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(id).first();
    return c.json(tenant);
});

// Delete tenant (admin only)
app.delete('/api/tenants/:id', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const id = c.req.param('id');

    // Check if tenant has any content
    const videoCount = await c.env.DB.prepare('SELECT COUNT(*) as count FROM videos WHERE tenant_id = ?').bind(id).first();
    if (videoCount && (videoCount.count as number) > 0) {
        return c.json({ error: 'Cannot delete tenant with existing videos. Delete or reassign videos first.' }, 400);
    }

    await c.env.DB.prepare('DELETE FROM tenants WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// Invite user to tenant with telegram handle
app.post('/api/tenants/:id/invite', async (c) => {
    const user = c.get('user');
    if (!user) return c.json({ error: 'Unauthorized' }, 401);

    const tenantId = c.req.param('id');
    const body = await c.req.json();

    if (!body.email && !body.telegram_handle) {
        return c.json({ error: 'email or telegram_handle is required' }, 400);
    }

    // Check tenant exists
    const tenant = await c.env.DB.prepare('SELECT * FROM tenants WHERE id = ?').bind(tenantId).first();
    if (!tenant) {
        return c.json({ error: 'Tenant not found' }, 404);
    }

    // Normalize telegram handle (ensure @ prefix)
    let telegramHandle = body.telegram_handle;
    if (telegramHandle && !telegramHandle.startsWith('@')) {
        telegramHandle = '@' + telegramHandle;
    }

    // Check if user exists with this email or telegram handle
    let existingUser = null;
    if (body.email) {
        existingUser = await c.env.DB.prepare('SELECT * FROM users WHERE email = ?').bind(body.email).first();
    }
    if (!existingUser && telegramHandle) {
        existingUser = await c.env.DB.prepare('SELECT * FROM users WHERE telegram_handle = ?').bind(telegramHandle).first();
    }

    if (existingUser) {
        // Update existing user to assign to tenant
        await c.env.DB.prepare('UPDATE users SET tenant_id = ?, telegram_handle = COALESCE(?, telegram_handle) WHERE id = ?')
            .bind(tenantId, telegramHandle, existingUser.id).run();
        const updated = await c.env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(existingUser.id).first();
        return c.json({ success: true, user: updated, action: 'updated' });
    }

    // Create new user
    const email = body.email || `${telegramHandle?.replace('@', '')}@telegram.kfytube`;
    const channelName = body.name || body.email?.split('@')[0] || telegramHandle?.replace('@', '') || 'User';

    // Generate magic link token
    const magicToken = crypto.randomUUID();
    const magicExpires = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 7 days

    const result = await c.env.DB.prepare(
        'INSERT INTO users (email, channel_name, tenant_id, telegram_handle, magic_link_token, magic_link_expires) VALUES (?, ?, ?, ?, ?, ?) RETURNING *'
    ).bind(email, channelName, tenantId, telegramHandle, magicToken, magicExpires).first();

    return c.json({
        success: true,
        user: result,
        action: 'created',
        magic_link: `/auth/magic/${magicToken}`
    });
});

// List users for a tenant
app.get('/api/tenants/:id/users', async (c) => {
    const tenantId = c.req.param('id');
    const users = await c.env.DB.prepare('SELECT id, email, channel_name, telegram_handle, created_at FROM users WHERE tenant_id = ?')
        .bind(tenantId).all();
    return c.json(users.results);
});

// Get current tenant info (for frontend to display)
app.get('/api/tenant-info', async (c) => {
    const tenant = c.get('tenant');
    const tenantId = c.get('tenantId') || 0;

    if (!tenant && tenantId === 0) {
        return c.json({
            id: 0,
            slug: null,
            name: 'Global',
            is_global: true
        });
    }

    return c.json(tenant);
});

// =====================================================
// AUTO-IMPORT CHANNELS & VIDEO QUEUE ENDPOINTS
// =====================================================

// Get all tracked YouTube channels for auto-import
app.get('/api/auto-import/channels', async (c) => {
    const channels = await c.env.DB.prepare(`
        SELECT yc.*, cat.name as category_name
        FROM youtube_channels yc
        LEFT JOIN categories cat ON yc.default_category_id = cat.id
        ORDER BY yc.channel_name ASC
    `).all();
    return c.json(channels.results);
});

// Add a new YouTube channel to track
app.post('/api/auto-import/channels', async (c) => {
    const body = await c.req.json();
    const { channel_id, channel_name, channel_handle, thumbnail_url, default_category_id, import_mode, min_views } = body;

    if (!channel_id || !channel_name) {
        return c.json({ error: 'channel_id and channel_name are required' }, 400);
    }

    try {
        await c.env.DB.prepare(`
            INSERT INTO youtube_channels (channel_id, channel_name, channel_handle, thumbnail_url, default_category_id, import_mode, min_views)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            channel_id,
            channel_name,
            channel_handle || null,
            thumbnail_url || null,
            default_category_id || null,
            import_mode || 'queue',
            min_views || 0
        ).run();

        return c.json({ success: true, message: 'Channel added' });
    } catch (e: any) {
        if (e.message?.includes('UNIQUE')) {
            return c.json({ error: 'Channel already exists' }, 409);
        }
        throw e;
    }
});

// Update a tracked channel
app.put('/api/auto-import/channels/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { channel_name, channel_handle, thumbnail_url, default_category_id, import_mode, min_views, is_active } = body;

    await c.env.DB.prepare(`
        UPDATE youtube_channels
        SET channel_name = COALESCE(?, channel_name),
            channel_handle = COALESCE(?, channel_handle),
            thumbnail_url = COALESCE(?, thumbnail_url),
            default_category_id = ?,
            import_mode = COALESCE(?, import_mode),
            min_views = COALESCE(?, min_views),
            is_active = COALESCE(?, is_active)
        WHERE id = ?
    `).bind(
        channel_name || null,
        channel_handle || null,
        thumbnail_url || null,
        default_category_id || null,
        import_mode || null,
        min_views ?? null,
        is_active ?? null,
        id
    ).run();

    return c.json({ success: true });
});

// Delete a tracked channel
app.delete('/api/auto-import/channels/:id', async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM youtube_channels WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// Get video queue with filters
app.get('/api/auto-import/queue', async (c) => {
    const status = c.req.query('status') || 'pending';
    const channelId = c.req.query('channel_id');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    let query = `
        SELECT vq.*, yc.channel_name, cat.name as category_name
        FROM video_queue vq
        LEFT JOIN youtube_channels yc ON vq.channel_id = yc.channel_id
        LEFT JOIN categories cat ON vq.suggested_category_id = cat.id
        WHERE vq.status = ?
    `;
    const params: any[] = [status];

    if (channelId) {
        query += ' AND vq.channel_id = ?';
        params.push(channelId);
    }

    query += ' ORDER BY vq.view_count DESC, vq.discovered_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const videos = await c.env.DB.prepare(query).bind(...params).all();

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM video_queue WHERE status = ?';
    const countParams: any[] = [status];
    if (channelId) {
        countQuery += ' AND channel_id = ?';
        countParams.push(channelId);
    }
    const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first() as any;

    return c.json({
        items: videos.results,
        total: countResult?.total || 0,
        limit,
        offset
    });
});

// Approve/reject videos in queue (bulk)
app.post('/api/auto-import/queue/review', async (c) => {
    const user = c.get('user');
    const body = await c.req.json();
    const { video_ids, action, category_id } = body;

    if (!video_ids || !Array.isArray(video_ids) || video_ids.length === 0) {
        return c.json({ error: 'video_ids array is required' }, 400);
    }
    if (!['approve', 'reject'].includes(action)) {
        return c.json({ error: 'action must be approve or reject' }, 400);
    }

    const placeholders = video_ids.map(() => '?').join(',');

    if (action === 'reject') {
        await c.env.DB.prepare(`
            UPDATE video_queue
            SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP
            WHERE id IN (${placeholders})
        `).bind(user?.id || null, ...video_ids).run();
        return c.json({ success: true, action: 'rejected', count: video_ids.length });
    }

    // Approve = import videos
    const queuedVideos = await c.env.DB.prepare(`
        SELECT vq.*, yc.default_category_id
        FROM video_queue vq
        LEFT JOIN youtube_channels yc ON vq.channel_id = yc.channel_id
        WHERE vq.id IN (${placeholders})
    `).bind(...video_ids).all();

    let imported = 0;
    for (const qv of queuedVideos.results as any[]) {
        // Use provided category_id, or suggested, or channel default
        const finalCategoryId = category_id || qv.suggested_category_id || qv.default_category_id;

        // Check if video already exists
        const existing = await c.env.DB.prepare(
            'SELECT id FROM videos WHERE youtube_id = ?'
        ).bind(qv.youtube_video_id).first();

        if (existing) {
            // Already exists, mark as imported
            await c.env.DB.prepare(`
                UPDATE video_queue
                SET status = 'imported', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, imported_video_id = ?
                WHERE id = ?
            `).bind(user?.id || null, (existing as any).id, qv.id).run();
            continue;
        }

        // Create the video with metadata from queue
        const durationSeconds = qv.duration ? parseISODuration(qv.duration) : null;
        const result = await c.env.DB.prepare(`
            INSERT INTO videos (title, youtube_id, source_type, category_id, is_short, duration, view_count, like_count, published_at)
            VALUES (?, ?, 'youtube', ?, ?, ?, ?, ?, ?)
        `).bind(
            qv.title,
            qv.youtube_video_id,
            finalCategoryId,
            qv.is_short || 0,
            durationSeconds,
            qv.view_count || 0,
            qv.like_count || 0,
            qv.published_at || null
        ).run();

        // Update queue item
        await c.env.DB.prepare(`
            UPDATE video_queue
            SET status = 'imported', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, imported_video_id = ?
            WHERE id = ?
        `).bind(user?.id || null, result.meta.last_row_id, qv.id).run();

        imported++;
    }

    return c.json({ success: true, action: 'approved', imported, total: video_ids.length });
});

// Get queue statistics
app.get('/api/auto-import/stats', async (c) => {
    const stats = await c.env.DB.prepare(`
        SELECT
            (SELECT COUNT(*) FROM video_queue WHERE status = 'pending') as pending,
            (SELECT COUNT(*) FROM video_queue WHERE status = 'approved') as approved,
            (SELECT COUNT(*) FROM video_queue WHERE status = 'rejected') as rejected,
            (SELECT COUNT(*) FROM video_queue WHERE status = 'imported') as imported,
            (SELECT COUNT(*) FROM youtube_channels WHERE is_active = 1) as active_channels,
            (SELECT COUNT(*) FROM youtube_channels) as total_channels
    `).first();
    return c.json(stats);
});

// Check YouTube API status
app.get('/api/auto-import/youtube-api-status', async (c) => {
    const hasApiKey = !!c.env.YOUTUBE_API_KEY;
    return c.json({
        enabled: hasApiKey,
        features: hasApiKey ? ['madeForKids filter', 'view counts', 'like counts', 'video duration', 'up to 50 videos per channel'] : ['RSS feed only', '15 videos max per channel'],
        message: hasApiKey
            ? 'YouTube Data API v3 is configured. Discovery will use API for enhanced filtering.'
            : 'No API key configured. Using free RSS feeds (limited to 15 most recent videos per channel).'
    });
});

// Trigger manual discovery run
app.post('/api/auto-import/run-discovery', async (c) => {
    const user = c.get('user');
    if (!user || (user.id !== 1 && user.email !== 'admin@kfytube.com')) {
        return c.json({ error: 'Admin only' }, 403);
    }

    try {
        const result = await discoverNewVideos(c.env);
        return c.json({
            success: true,
            ...result,
            message: `Discovered ${result.discovered} videos from ${result.channels} channels`
        });
    } catch (e: any) {
        console.error('Manual discovery error:', e);
        return c.json({ error: e.message || 'Discovery failed' }, 500);
    }
});

// Import existing channels from playlists into youtube_channels for auto-import tracking
app.post('/api/auto-import/import-existing-channels', async (c) => {
    const user = c.get('user');
    if (!user || (user.id !== 1 && user.email !== 'admin@kfytube.com')) {
        return c.json({ error: 'Admin only' }, 403);
    }

    try {
        // Get all playlists with source_channel_id that start with UC (YouTube channels)
        const playlists = await c.env.DB.prepare(`
            SELECT DISTINCT source_channel_id, name
            FROM playlists
            WHERE source_channel_id IS NOT NULL
              AND source_channel_id LIKE 'UC%'
        `).all();

        let imported = 0;
        let skipped = 0;

        for (const pl of playlists.results as any[]) {
            // Check if channel already exists in youtube_channels
            const existing = await c.env.DB.prepare(
                'SELECT id FROM youtube_channels WHERE channel_id = ?'
            ).bind(pl.source_channel_id).first();

            if (existing) {
                skipped++;
                continue;
            }

            // Extract channel name (remove the " - UCxxxx" suffix if present)
            let channelName = pl.name;
            if (channelName.includes(' - UC')) {
                channelName = channelName.split(' - UC')[0];
            }

            // Insert into youtube_channels
            await c.env.DB.prepare(`
                INSERT INTO youtube_channels (channel_id, channel_name, import_mode, is_active)
                VALUES (?, ?, 'queue', 1)
            `).bind(pl.source_channel_id, channelName).run();

            imported++;
        }

        return c.json({
            success: true,
            imported,
            skipped,
            total: playlists.results.length,
            message: `Imported ${imported} channels for auto-tracking (${skipped} already existed)`
        });
    } catch (e: any) {
        console.error('Import existing channels error:', e);
        return c.json({ error: e.message || 'Import failed' }, 500);
    }
});

// Search YouTube for kid-friendly videos (requires API key)
app.post('/api/auto-import/search-youtube', async (c) => {
    const user = c.get('user');
    if (!user || (user.id !== 1 && user.email !== 'admin@kfytube.com')) {
        return c.json({ error: 'Admin only' }, 403);
    }

    if (!c.env.YOUTUBE_API_KEY) {
        return c.json({ error: 'YouTube API key not configured' }, 400);
    }

    const body = await c.req.json();
    const { query, maxResults = 25, safeSearch = 'strict' } = body;

    if (!query) {
        return c.json({ error: 'Search query required' }, 400);
    }

    try {
        // Search for videos with strict safe search
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&videoEmbeddable=true&safeSearch=${safeSearch}&maxResults=${maxResults}&q=${encodeURIComponent(query)}&key=${c.env.YOUTUBE_API_KEY}`;

        const searchRes = await fetch(searchUrl);
        if (!searchRes.ok) {
            const errData: any = await searchRes.json();
            return c.json({ error: errData.error?.message || 'YouTube search failed' }, 400);
        }

        const searchData: any = await searchRes.json();
        const videoIds = searchData.items?.map((item: any) => item.id.videoId) || [];

        if (videoIds.length === 0) {
            return c.json({ videos: [], message: 'No videos found' });
        }

        // Get detailed video info including madeForKids status
        const videos = await getVideoDetails(videoIds, c.env.YOUTUBE_API_KEY);

        // Filter to only madeForKids videos if we have results
        const kidsVideos = videos.filter(v => v.madeForKids === true);

        return c.json({
            videos: videos,
            kidsVideos: kidsVideos,
            totalFound: videos.length,
            madeForKidsCount: kidsVideos.length,
            message: `Found ${videos.length} videos, ${kidsVideos.length} marked as Made for Kids`
        });
    } catch (e: any) {
        console.error('YouTube search error:', e);
        return c.json({ error: e.message || 'Search failed' }, 500);
    }
});

// Add videos from search results to the queue
app.post('/api/auto-import/queue-from-search', async (c) => {
    const user = c.get('user');
    if (!user || (user.id !== 1 && user.email !== 'admin@kfytube.com')) {
        return c.json({ error: 'Admin only' }, 403);
    }

    const body = await c.req.json();
    const { videos, suggested_category_id } = body;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
        return c.json({ error: 'Videos array required' }, 400);
    }

    let added = 0;
    let skipped = 0;

    for (const video of videos) {
        // Check if already in queue or imported
        const existing = await c.env.DB.prepare(`
            SELECT id FROM video_queue WHERE youtube_video_id = ?
            UNION
            SELECT id FROM videos WHERE youtube_id = ?
        `).bind(video.id, video.id).first();

        if (existing) {
            skipped++;
            continue;
        }

        // Add to queue
        await c.env.DB.prepare(`
            INSERT INTO video_queue (
                youtube_video_id, channel_id, title, thumbnail_url,
                duration, view_count, like_count, published_at,
                is_made_for_kids, is_short, suggested_category_id, status
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
        `).bind(
            video.id,
            video.channelId || 'search',
            video.title,
            video.thumbnailUrl,
            video.duration,
            video.viewCount || 0,
            video.likeCount || 0,
            video.publishedAt,
            video.madeForKids ? 1 : 0,
            video.isShort ? 1 : 0,
            suggested_category_id || null
        ).run();

        added++;
    }

    return c.json({
        success: true,
        added,
        skipped,
        message: `Added ${added} videos to queue (${skipped} already existed)`
    });
});

// Get curated list of popular kids channels
app.get('/api/auto-import/suggested-channels', async (c) => {
    // Curated list of popular, trusted kids education channels
    const suggestedChannels = [
        { id: 'UC5uIZ2KOZZeQDQo_Gsi_qbQ', name: 'Cosmic Kids Yoga', category: 'Health & Fitness' },
        { id: 'UCPlwvN0w4qFSP1FllALB92w', name: 'Numberblocks', category: 'Math' },
        { id: 'UC_qs3c0ehDvZkbiEbOj6Drg', name: 'Alphablocks', category: 'Reading' },
        { id: 'UCxlJ45KjG4XVcQ_hd8j227A', name: 'Peekaboo Kidz', category: 'Science' },
        { id: 'UCXVCgDuD_QCkI7gTKU7-tpg', name: 'National Geographic Kids', category: 'Science' },
        { id: 'UCsooa4yRKGN_zEE8iknghZA', name: 'TED-Ed', category: 'Education' },
        { id: 'UC4a-Gbdw7vOaccHmFo40b9g', name: 'Khan Academy', category: 'Education' },
        { id: 'UC2ri4rEb8abnNwXvTjg5ARw', name: 'Khan Academy Kids', category: 'Early Learning' },
        { id: 'UCG2CL6EUjG8TVT1Tpl9nJdg', name: 'Ms Rachel - Toddler Learning', category: 'Early Learning' },
        { id: 'UCVzLLZkDuFGAE2BGdBuBNBg', name: 'Bluey Official', category: 'Entertainment' },
        { id: 'UCrNnk0wFBnCS1awGjq_ijGQ', name: 'PBS Kids', category: 'Entertainment' },
        { id: 'UC5XMF3Inoi8R9nSI8ChOsdQ', name: 'Art for Kids Hub', category: 'Art' },
        { id: 'UCVcQH8A634mauPrGbWs7QlQ', name: 'Jack Hartmann Kids Music', category: 'Music' },
        { id: 'UC8NFs-VWUsyuq4zaYVVMgCQ', name: 'Scratch Garden', category: 'Music & Learning' },
        { id: 'UCfPyVJEBD7Di1YYjTdS2v8g', name: 'Homeschool Pop', category: 'Education' },
        { id: 'UCONtPx56PSebXJOxbFv-2jQ', name: 'Crash Course Kids', category: 'Science' },
        { id: 'UCc-BG8L5o7yqQjM81yHePnA', name: 'Pebbles Kids Learning', category: 'Early Learning' },
        { id: 'UC_dpB5SImaseMZpLu8s-r7w', name: 'Blippi Wonders', category: 'Early Learning' },
        { id: 'UCBuMwlP7kHkNxdPAqtFSJTw', name: 'Math Antics', category: 'Math' },
        { id: 'UC47Uh7XWApFNpCqQ80e61ug', name: 'Preschool Prep Company', category: 'Early Learning' },
        // More channels for variety
        { id: 'UCQkuKPaVlYK7QCIVTb0lV2Q', name: 'Colourblocks', category: 'Art & Colors' },
        { id: 'UCpbpfcZfo-hoDAx2m1blFhg', name: 'Blocks Universe', category: 'Learning' },
        { id: 'UCAJnyTWJPpKXuwgWQDdNWrQ', name: 'Netflix Jr', category: 'Entertainment' },
        { id: 'UCYqksDldZTkKmsrBb4OGJ9g', name: 'Lucas & Friends', category: 'Early Learning' },
        { id: 'UCKcQ7Jo2VAGHiPMfDwzeRUw', name: 'ChuChuTV Surprise Eggs', category: 'Early Learning' },
    ];

    // Check which ones are already tracked
    const tracked = await c.env.DB.prepare(
        'SELECT channel_id FROM youtube_channels'
    ).all();
    const trackedIds = new Set((tracked.results as any[]).map(t => t.channel_id));

    const result = suggestedChannels.map(ch => ({
        ...ch,
        isTracked: trackedIds.has(ch.id)
    }));

    return c.json({
        channels: result,
        trackedCount: result.filter(r => r.isTracked).length,
        totalSuggested: result.length
    });
});

// Discover channels from a video (find related channels)
app.post('/api/auto-import/discover-channel-from-video', async (c) => {
    const user = c.get('user');
    if (!user || (user.id !== 1 && user.email !== 'admin@kfytube.com')) {
        return c.json({ error: 'Admin only' }, 403);
    }

    if (!c.env.YOUTUBE_API_KEY) {
        return c.json({ error: 'YouTube API key not configured' }, 400);
    }

    const body = await c.req.json();
    const { videoId } = body;

    if (!videoId) {
        return c.json({ error: 'Video ID required' }, 400);
    }

    try {
        // Get video details including channel info
        const url = `https://www.googleapis.com/youtube/v3/videos?part=snippet,status&id=${videoId}&key=${c.env.YOUTUBE_API_KEY}`;
        const res = await fetch(url);

        if (!res.ok) {
            return c.json({ error: 'Failed to fetch video info' }, 400);
        }

        const data: any = await res.json();
        if (!data.items || data.items.length === 0) {
            return c.json({ error: 'Video not found' }, 404);
        }

        const video = data.items[0];
        const channelId = video.snippet.channelId;
        const channelTitle = video.snippet.channelTitle;

        // Check if channel is already tracked
        const existing = await c.env.DB.prepare(
            'SELECT id FROM youtube_channels WHERE channel_id = ?'
        ).bind(channelId).first();

        // Get channel thumbnail
        const channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet&id=${channelId}&key=${c.env.YOUTUBE_API_KEY}`;
        const channelRes = await fetch(channelUrl);
        let thumbnailUrl = null;
        if (channelRes.ok) {
            const channelData: any = await channelRes.json();
            if (channelData.items?.[0]) {
                thumbnailUrl = channelData.items[0].snippet?.thumbnails?.medium?.url;
            }
        }

        return c.json({
            channelId,
            channelName: channelTitle,
            thumbnailUrl,
            isTracked: !!existing,
            videoTitle: video.snippet.title,
            madeForKids: video.status?.madeForKids === true
        });
    } catch (e: any) {
        console.error('Discover channel error:', e);
        return c.json({ error: e.message || 'Discovery failed' }, 500);
    }
});

// Get import rules
app.get('/api/auto-import/rules', async (c) => {
    const rules = await c.env.DB.prepare(`
        SELECT ir.*, cat.name as category_name
        FROM import_rules ir
        LEFT JOIN categories cat ON ir.target_category_id = cat.id
        ORDER BY ir.priority DESC, ir.name ASC
    `).all();
    return c.json(rules.results);
});

// Add import rule
app.post('/api/auto-import/rules', async (c) => {
    const body = await c.req.json();
    const { name, pattern, pattern_type, target_category_id, priority } = body;

    if (!name || !pattern || !target_category_id) {
        return c.json({ error: 'name, pattern, and target_category_id are required' }, 400);
    }

    await c.env.DB.prepare(`
        INSERT INTO import_rules (name, pattern, pattern_type, target_category_id, priority)
        VALUES (?, ?, ?, ?, ?)
    `).bind(name, pattern, pattern_type || 'contains', target_category_id, priority || 0).run();

    return c.json({ success: true });
});

// Update import rule
app.put('/api/auto-import/rules/:id', async (c) => {
    const id = c.req.param('id');
    const body = await c.req.json();
    const { name, pattern, pattern_type, target_category_id, priority, is_active } = body;

    await c.env.DB.prepare(`
        UPDATE import_rules
        SET name = COALESCE(?, name),
            pattern = COALESCE(?, pattern),
            pattern_type = COALESCE(?, pattern_type),
            target_category_id = COALESCE(?, target_category_id),
            priority = COALESCE(?, priority),
            is_active = COALESCE(?, is_active)
        WHERE id = ?
    `).bind(name, pattern, pattern_type, target_category_id, priority, is_active, id).run();

    return c.json({ success: true });
});

// Delete import rule
app.delete('/api/auto-import/rules/:id', async (c) => {
    const id = c.req.param('id');
    await c.env.DB.prepare('DELETE FROM import_rules WHERE id = ?').bind(id).run();
    return c.json({ success: true });
});

// Manually trigger discovery for a channel
app.post('/api/auto-import/channels/:id/discover', async (c) => {
    const id = c.req.param('id');
    const channel = await c.env.DB.prepare('SELECT * FROM youtube_channels WHERE id = ?').bind(id).first() as any;

    if (!channel) {
        return c.json({ error: 'Channel not found' }, 404);
    }

    // Fetch videos using RSS
    const videos = await fetchChannelVideos(channel.channel_id);
    if (!videos || videos.length === 0) {
        return c.json({ error: 'No videos found' }, 404);
    }

    // Get import rules for auto-categorization
    const rules = await c.env.DB.prepare(`
        SELECT * FROM import_rules WHERE is_active = 1 ORDER BY priority DESC
    `).all();

    let discovered = 0;
    let skipped = 0;

    for (const video of videos) {
        // Check if already in queue or imported
        const existing = await c.env.DB.prepare(`
            SELECT id FROM video_queue WHERE youtube_video_id = ?
            UNION
            SELECT id FROM videos WHERE youtube_id = ?
        `).bind(video.id, video.id).first();

        if (existing) {
            skipped++;
            continue;
        }

        // Apply import rules to suggest category
        let suggestedCategoryId = channel.default_category_id;
        for (const rule of rules.results as any[]) {
            const pattern = rule.pattern.toLowerCase();
            const title = video.title.toLowerCase();

            let matches = false;
            if (rule.pattern_type === 'contains') {
                matches = title.includes(pattern);
            } else if (rule.pattern_type === 'starts_with') {
                matches = title.startsWith(pattern);
            } else if (rule.pattern_type === 'regex') {
                try {
                    matches = new RegExp(pattern, 'i').test(title);
                } catch (e) { }
            }

            if (matches) {
                suggestedCategoryId = rule.target_category_id;
                break;
            }
        }

        // Determine if it's a short
        const isShort = video.isShort || video.id?.includes('/shorts/') || false;

        // Add to queue
        try {
            await c.env.DB.prepare(`
                INSERT INTO video_queue (youtube_video_id, channel_id, title, thumbnail_url, is_short, suggested_category_id)
                VALUES (?, ?, ?, ?, ?, ?)
            `).bind(
                video.id,
                channel.channel_id,
                video.title,
                `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
                isShort ? 1 : 0,
                suggestedCategoryId
            ).run();
            discovered++;
        } catch (e) {
            // Duplicate, skip
            skipped++;
        }
    }

    // Update last synced
    await c.env.DB.prepare(`
        UPDATE youtube_channels SET last_synced = CURRENT_TIMESTAMP, video_count = video_count + ?
        WHERE id = ?
    `).bind(discovered, id).run();

    return c.json({ success: true, discovered, skipped, total: videos.length });
});

// Resolve channel info from YouTube URL or handle
app.get('/api/auto-import/resolve-channel', async (c) => {
    const input = c.req.query('input');
    if (!input) {
        return c.json({ error: 'input parameter required' }, 400);
    }

    // Try to extract channel ID from various URL formats
    let channelId: string | null = null;
    let channelName: string | null = null;
    let channelHandle: string | null = null;

    // Direct channel ID (starts with UC)
    if (input.startsWith('UC') && input.length === 24) {
        channelId = input;
    }
    // YouTube channel URL
    else if (input.includes('youtube.com')) {
        const url = new URL(input);
        const path = url.pathname;

        if (path.startsWith('/channel/')) {
            channelId = path.split('/channel/')[1]?.split('/')[0];
        } else if (path.startsWith('/@')) {
            channelHandle = path.split('/@')[1]?.split('/')[0];
        } else if (path.startsWith('/c/') || path.startsWith('/user/')) {
            // Legacy format - need to resolve
            channelHandle = path.split('/')[2];
        }
    }
    // Handle (starts with @)
    else if (input.startsWith('@')) {
        channelHandle = input.substring(1);
    }

    if (!channelId && !channelHandle) {
        return c.json({ error: 'Could not parse channel from input' }, 400);
    }

    // If we have a handle but not ID, try to resolve via RSS feed
    if (channelHandle && !channelId) {
        // Try Invidious API to resolve handle to channel ID
        const instances = [
            'https://inv.tux.pizza',
            'https://vid.puffyan.us',
            'https://invidious.projectsegfau.lt'
        ];

        for (const host of instances) {
            try {
                const res = await fetch(`${host}/api/v1/channels/@${channelHandle}`, {
                    headers: { 'User-Agent': 'KfyTube/1.0' }
                });
                if (res.ok) {
                    const data: any = await res.json();
                    channelId = data.authorId;
                    channelName = data.author;
                    break;
                }
            } catch (e) {
                continue;
            }
        }
    }

    // Fetch channel info if we have ID
    if (channelId) {
        // Try RSS feed to get channel name
        try {
            const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
            const res = await fetch(rssUrl);
            if (res.ok) {
                const text = await res.text();
                const nameMatch = /<author>\s*<name>(.*?)<\/name>/.exec(text);
                if (nameMatch) {
                    channelName = nameMatch[1];
                }
            }
        } catch (e) { }
    }

    if (!channelId) {
        return c.json({ error: 'Could not resolve channel ID' }, 404);
    }

    return c.json({
        channel_id: channelId,
        channel_name: channelName || 'Unknown',
        channel_handle: channelHandle ? `@${channelHandle}` : null,
        thumbnail_url: `https://www.youtube.com/channel/${channelId}`
    });
});

// =====================================================
// END AUTO-IMPORT ENDPOINTS
// =====================================================

// Scheduled handler for daily video refresh (5AM UTC)
async function refreshAllChannels(env: Bindings) {
    console.log('Starting scheduled refresh of channels (batched)...');

    // Get 5 channels that haven't been refreshed recently (oldest first, NULL = never refreshed)
    // This allows the cron to process all channels over multiple runs without timeout
    const BATCH_SIZE = 5;
    const playlists = await env.DB.prepare(`
        SELECT id, name, source_channel_id
        FROM playlists
        WHERE source_channel_id IS NOT NULL
        ORDER BY last_refreshed ASC NULLS FIRST
        LIMIT ?
    `).bind(BATCH_SIZE).all();

    if (!playlists.results || playlists.results.length === 0) {
        console.log('No imported channels to refresh');
        return { refreshed: 0, errors: 0 };
    }

    console.log(`Processing ${playlists.results.length} channels this run`);

    let refreshed = 0;
    let errors = 0;

    for (const pl of playlists.results as any[]) {
        try {
            console.log(`Refreshing channel: ${pl.name} (${pl.source_channel_id})`);

            // Fetch videos from YouTube RSS
            const videos = await fetchChannelVideos(pl.source_channel_id);
            if (!videos || videos.length === 0) {
                console.log(`No videos found for ${pl.name}`);
                // Still update last_refreshed to avoid retrying failed channels repeatedly
                await env.DB.prepare('UPDATE playlists SET last_refreshed = CURRENT_TIMESTAMP WHERE id = ?').bind(pl.id).run();
                errors++;
                continue;
            }

            // Get or create channel user
            const channelEmail = `${pl.source_channel_id}@imported.kfytube`;
            let channelUser: any = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(channelEmail).first();

            if (!channelUser) {
                let name = pl.name.replace('Best of ', '').replace('Channel ', '');
                if (name === pl.source_channel_id) name = 'Imported Channel';
                channelUser = await env.DB.prepare('INSERT INTO users (email, channel_name, tenant_id) VALUES (?, ?, 0) RETURNING id')
                    .bind(channelEmail, name).first();
            }
            const targetChannelId = channelUser.id;

            // Insert new videos (INSERT OR IGNORE will skip existing)
            const insertVideo = env.DB.prepare('INSERT OR IGNORE INTO videos (youtube_id, title, is_global, channel_id, source_type) VALUES (?, ?, 1, ?, "youtube")');
            const videoBatch = videos.map((v: any) => insertVideo.bind(v.id, v.title, targetChannelId));
            await env.DB.batch(videoBatch);

            // Update playlist items
            const placeholders = videos.map(() => '?').join(',');
            const ids = videos.map((v: any) => v.id);
            const videoRows = await env.DB.prepare(`SELECT id, youtube_id FROM videos WHERE youtube_id IN (${placeholders})`).bind(...ids).all();
            const videoIdMap = new Map();
            videoRows.results.forEach((r: any) => videoIdMap.set(r.youtube_id, r.id));

            // Clear & Refill playlist for sync
            await env.DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').bind(pl.id).run();

            const insertPl = env.DB.prepare('INSERT OR IGNORE INTO playlist_items (playlist_id, video_id, sort_order) VALUES (?, ?, ?)');
            const plBatch: any[] = [];
            videos.forEach((v: any, index: number) => {
                const internalId = videoIdMap.get(v.id);
                if (internalId) {
                    plBatch.push(insertPl.bind(pl.id, internalId, index));
                }
            });
            if (plBatch.length > 0) await env.DB.batch(plBatch);

            // Update last_refreshed timestamp
            await env.DB.prepare('UPDATE playlists SET last_refreshed = CURRENT_TIMESTAMP WHERE id = ?').bind(pl.id).run();

            console.log(`Refreshed ${pl.name}: ${videos.length} videos`);
            refreshed++;

        } catch (e) {
            console.error(`Error refreshing ${pl.name}:`, e);
            // Still update last_refreshed to prevent infinite retry loops
            await env.DB.prepare('UPDATE playlists SET last_refreshed = CURRENT_TIMESTAMP WHERE id = ?').bind(pl.id).run();
            errors++;
        }
    }

    console.log(`Scheduled refresh complete: ${refreshed} refreshed, ${errors} errors (batch of ${BATCH_SIZE})`);
    return { refreshed, errors };
}

// Auto-discovery: Check tracked YouTube channels for new videos
async function discoverNewVideos(env: Bindings) {
    console.log('Starting auto-discovery of new videos...');
    const useYouTubeAPI = !!env.YOUTUBE_API_KEY;
    console.log(`Using YouTube API: ${useYouTubeAPI}`);

    // Get active tracked channels (oldest synced first)
    // Process more channels when using API since we get better data
    const BATCH_SIZE = useYouTubeAPI ? 5 : 3;
    const channels = await env.DB.prepare(`
        SELECT * FROM youtube_channels
        WHERE is_active = 1
        ORDER BY last_synced ASC NULLS FIRST
        LIMIT ?
    `).bind(BATCH_SIZE).all();

    if (!channels.results || channels.results.length === 0) {
        console.log('No tracked channels for auto-discovery');
        return { discovered: 0, channels: 0, skipped: 0 };
    }

    // Get import rules
    const rules = await env.DB.prepare(`
        SELECT * FROM import_rules WHERE is_active = 1 ORDER BY priority DESC
    `).all();

    let totalDiscovered = 0;
    let processedChannels = 0;
    let skippedMadeForKids = 0;
    let skippedLowViews = 0;

    for (const channel of channels.results as any[]) {
        try {
            console.log(`Discovering videos from: ${channel.channel_name}`);

            let videos: any[] = [];

            if (useYouTubeAPI && env.YOUTUBE_API_KEY) {
                // Use YouTube API for better data (stats, madeForKids)
                const apiVideos = await fetchChannelVideosWithAPI(channel.channel_id, env.YOUTUBE_API_KEY, 50);
                videos = apiVideos.map(v => ({
                    id: v.id,
                    title: v.title,
                    isShort: v.isShort,
                    viewCount: v.viewCount,
                    likeCount: v.likeCount,
                    duration: v.duration,
                    publishedAt: v.publishedAt,
                    madeForKids: v.madeForKids,
                    thumbnailUrl: v.thumbnailUrl
                }));
                console.log(`YouTube API returned ${videos.length} videos`);
            } else {
                // Fallback to RSS (free, but limited data)
                const rssVideos = await fetchChannelVideos(channel.channel_id);
                if (rssVideos) {
                    videos = rssVideos;
                }
            }

            if (!videos || videos.length === 0) {
                console.log(`No videos from ${channel.channel_name}`);
                await env.DB.prepare('UPDATE youtube_channels SET last_synced = CURRENT_TIMESTAMP WHERE id = ?')
                    .bind(channel.id).run();
                continue;
            }

            let discovered = 0;

            for (const video of videos) {
                // Check if already in queue or imported
                const existing = await env.DB.prepare(`
                    SELECT id FROM video_queue WHERE youtube_video_id = ?
                    UNION
                    SELECT id FROM videos WHERE youtube_id = ?
                `).bind(video.id, video.id).first();

                if (existing) continue;

                // Filter: Skip videos NOT marked as made for kids (if we have that info)
                // For a kids-focused platform, we only want madeForKids content
                if (useYouTubeAPI && video.madeForKids === false) {
                    skippedMadeForKids++;
                    console.log(`Skipping non-kids video: ${video.title}`);
                    continue;
                }

                // Filter: Skip videos below minimum view threshold
                if (channel.min_views > 0 && video.viewCount !== undefined && video.viewCount < channel.min_views) {
                    skippedLowViews++;
                    continue;
                }

                // Apply import rules to suggest category
                let suggestedCategoryId = channel.default_category_id;
                for (const rule of rules.results as any[]) {
                    const pattern = rule.pattern.toLowerCase();
                    const title = video.title.toLowerCase();

                    let matches = false;
                    if (rule.pattern_type === 'contains') {
                        matches = title.includes(pattern);
                    } else if (rule.pattern_type === 'starts_with') {
                        matches = title.startsWith(pattern);
                    } else if (rule.pattern_type === 'regex') {
                        try { matches = new RegExp(pattern, 'i').test(title); } catch (e) { }
                    }

                    if (matches) {
                        suggestedCategoryId = rule.target_category_id;
                        break;
                    }
                }

                // Determine if it's a short
                const isShort = video.isShort || false;

                // Add to queue with full stats
                try {
                    await env.DB.prepare(`
                        INSERT INTO video_queue (
                            youtube_video_id, channel_id, title, thumbnail_url,
                            duration, view_count, like_count, published_at,
                            is_made_for_kids, is_short, suggested_category_id, status
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `).bind(
                        video.id,
                        channel.channel_id,
                        video.title,
                        video.thumbnailUrl || `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`,
                        video.duration || null,
                        video.viewCount || 0,
                        video.likeCount || 0,
                        video.publishedAt || null,
                        video.madeForKids ? 1 : 0,
                        isShort ? 1 : 0,
                        suggestedCategoryId,
                        channel.import_mode === 'auto' ? 'approved' : 'pending'
                    ).run();
                    discovered++;

                    // If auto-import mode and meets criteria, import immediately
                    if (channel.import_mode === 'auto') {
                        // Auto-import: create video directly with metadata
                        const durationSeconds = video.duration ? parseISODuration(video.duration) : null;
                        const result = await env.DB.prepare(`
                            INSERT INTO videos (title, youtube_id, source_type, category_id, is_short, duration, view_count, like_count, published_at)
                            VALUES (?, ?, 'youtube', ?, ?, ?, ?, ?, ?)
                        `).bind(video.title, video.id, suggestedCategoryId, isShort ? 1 : 0, durationSeconds, video.viewCount || 0, video.likeCount || 0, video.publishedAt || null).run();

                        // Update queue status
                        await env.DB.prepare(`
                            UPDATE video_queue SET status = 'imported', imported_video_id = ?
                            WHERE youtube_video_id = ?
                        `).bind(result.meta.last_row_id, video.id).run();
                    }
                } catch (e) {
                    // Duplicate, skip
                }
            }

            // Update last synced
            await env.DB.prepare(`
                UPDATE youtube_channels SET last_synced = CURRENT_TIMESTAMP, video_count = video_count + ?
                WHERE id = ?
            `).bind(discovered, channel.id).run();

            totalDiscovered += discovered;
            processedChannels++;
            console.log(`Discovered ${discovered} new videos from ${channel.channel_name}`);

        } catch (e) {
            console.error(`Error discovering from ${channel.channel_name}:`, e);
            await env.DB.prepare('UPDATE youtube_channels SET last_synced = CURRENT_TIMESTAMP WHERE id = ?')
                .bind(channel.id).run();
        }
    }

    console.log(`Auto-discovery complete: ${totalDiscovered} videos from ${processedChannels} channels`);
    console.log(`Skipped: ${skippedMadeForKids} non-kids, ${skippedLowViews} low views`);
    return { discovered: totalDiscovered, channels: processedChannels, skippedMadeForKids, skippedLowViews };
}

// Backfill metadata for existing videos (one-time migration worker)
// Processes videos in small batches to avoid timeouts
async function backfillVideoMetadata(env: Bindings) {
    if (!env.YOUTUBE_API_KEY) {
        console.log('No YouTube API key configured, skipping metadata backfill');
        return { backfilled: 0, remaining: 0 };
    }

    const BATCH_SIZE = 10; // Process 10 videos per run (every minute)

    // Get videos without metadata (where duration is NULL)
    const videos = await env.DB.prepare(`
        SELECT id, youtube_id
        FROM videos
        WHERE duration IS NULL
        AND source_type = 'youtube'
        ORDER BY created_at DESC
        LIMIT ?
    `).bind(BATCH_SIZE).all();

    if (!videos.results || videos.results.length === 0) {
        console.log('All videos have metadata - backfill complete!');
        return { backfilled: 0, remaining: 0 };
    }

    console.log(`Backfilling metadata for ${videos.results.length} videos...`);

    const videoIds = videos.results.map((v: any) => v.youtube_id);
    const details = await getVideoDetails(videoIds, env.YOUTUBE_API_KEY);

    let updated = 0;
    for (const detail of details) {
        const video = videos.results.find((v: any) => v.youtube_id === detail.id);
        if (!video) continue;

        const durationSeconds = detail.duration ? parseISODuration(detail.duration) : null;

        try {
            await env.DB.prepare(`
                UPDATE videos
                SET duration = ?, view_count = ?, like_count = ?, published_at = ?
                WHERE id = ?
            `).bind(
                durationSeconds,
                detail.viewCount || 0,
                detail.likeCount || 0,
                detail.publishedAt || null,
                video.id
            ).run();
            updated++;
        } catch (e) {
            console.error(`Failed to update video ${video.id}:`, e);
        }
    }

    // Count remaining videos without metadata
    const remaining = await env.DB.prepare(`
        SELECT COUNT(*) as count
        FROM videos
        WHERE duration IS NULL
        AND source_type = 'youtube'
    `).first();

    console.log(`Backfilled ${updated} videos, ${remaining?.count || 0} remaining`);
    return { backfilled: updated, remaining: remaining?.count || 0 };
}

// Manual trigger endpoint for backfill (for testing or manual runs)
app.get('/api/backfill/metadata', async (c) => {
    const user = c.get('user');
    if (!user || user.id !== 1) {
        return c.json({ error: 'Admin only' }, 403);
    }

    const result = await backfillVideoMetadata(c.env);
    return c.json(result);
});

// --- VISIBILITY & IMPORT LOGS ENDPOINTS ---

// Toggle video visibility (admin only)
app.post('/api/videos/:id/visibility', async (c) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
    }

    const videoId = c.req.param('id');
    const body = await c.req.json();
    const isVisible = body.is_visible;

    if (isVisible === undefined || typeof isVisible !== 'boolean') {
        return c.json({ error: 'is_visible must be a boolean' }, 400);
    }

    try {
        await c.env.DB.prepare('UPDATE videos SET is_visible = ? WHERE id = ?')
            .bind(isVisible ? 1 : 0, videoId)
            .run();

        return c.json({
            success: true,
            video_id: videoId,
            is_visible: isVisible
        });
    } catch (e) {
        console.error('Failed to update visibility:', e);
        return c.json({ error: 'Failed to update visibility' }, 500);
    }
});

// Get import logs for all videos (admin only)
app.get('/api/import-logs', async (c) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
    }

    const page = parseInt(c.req.query('page') || '1');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = (page - 1) * limit;
    const source = c.req.query('source');

    try {
        let query = 'SELECT * FROM import_logs WHERE 1=1';
        const params: any[] = [];

        if (source) {
            query += ' AND import_source = ?';
            params.push(source);
        }

        query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const results = await c.env.DB.prepare(query).bind(...params).all();

        const countQuery = source
            ? 'SELECT COUNT(*) as total FROM import_logs WHERE import_source = ?'
            : 'SELECT COUNT(*) as total FROM import_logs';
        const countParams = source ? [source] : [];
        const countRes = await c.env.DB.prepare(countQuery).bind(...countParams).first();

        return c.json({
            items: results.results,
            total: countRes?.total || 0,
            page,
            limit,
            total_pages: Math.ceil((countRes?.total || 0) / limit)
        });
    } catch (e) {
        console.error('Failed to fetch import logs:', e);
        return c.json({ error: 'Failed to fetch import logs' }, 500);
    }
});

// Get import logs for a specific video
app.get('/api/videos/:id/import-logs', async (c) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
    }

    const videoId = c.req.param('id');

    try {
        const logs = await c.env.DB.prepare(`
            SELECT * FROM import_logs
            WHERE video_id = ?
            ORDER BY created_at DESC
        `).bind(videoId).all();

        return c.json({ logs: logs.results || [] });
    } catch (e) {
        console.error('Failed to fetch import logs for video:', e);
        return c.json({ error: 'Failed to fetch import logs' }, 500);
    }
});

// Add import log entry (internal use)
app.post('/api/videos/:id/import-logs', async (c) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ error: 'Authentication required' }, 401);
    }

    const videoId = c.req.param('id');
    const body = await c.req.json();

    const { import_source, import_method, source_name, source_id, metadata } = body;

    if (!import_source || !import_method) {
        return c.json({ error: 'import_source and import_method are required' }, 400);
    }

    try {
        const result = await c.env.DB.prepare(`
            INSERT INTO import_logs (video_id, import_source, import_method, source_name, source_id, imported_by, metadata)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            RETURNING id, created_at
        `).bind(
            videoId,
            import_source,
            import_method,
            source_name || null,
            source_id || null,
            user.email || 'system',
            metadata ? JSON.stringify(metadata) : null
        ).first();

        return c.json({
            success: true,
            log: result
        });
    } catch (e) {
        console.error('Failed to add import log:', e);
        return c.json({ error: 'Failed to add import log' }, 500);
    }
});

// --- CONTENT SAFETY ENDPOINTS ---

// Get pending videos for AI safety review
app.get('/api/safety/queue', async (c) => {
    const user = c.get('user');
    if (!user || (user.id !== 1 && user.email !== 'admin@kfytube.com')) {
        return c.json({ error: 'Admin only' }, 403);
    }

    const status = c.req.query('status') || 'pending';
    const minScore = parseInt(c.req.query('minScore') || '0');
    const limit = parseInt(c.req.query('limit') || '50');
    const offset = parseInt(c.req.query('offset') || '0');

    try {
        let query = `
            SELECT vq.*, yc.channel_name
            FROM video_queue vq
            LEFT JOIN youtube_channels yc ON vq.channel_id = yc.channel_id
            WHERE vq.safety_review_status = ?
        `;
        const params: any[] = [status];

        if (minScore > 0) {
            query += ' AND (vq.kids_safety_score IS NULL OR vq.kids_safety_score >= ?)';
            params.push(minScore);
        }

        query += ' ORDER BY vq.kids_safety_score ASC, vq.reviewed_by_ai_at DESC LIMIT ? OFFSET ?';
        params.push(limit, offset);

        const videos = await c.env.DB.prepare(query).bind(...params).all();

        // Get count
        let countQuery = 'SELECT COUNT(*) as total FROM video_queue WHERE safety_review_status = ?';
        const countParams: any[] = [status];
        if (minScore > 0) {
            countQuery += ' AND (vq.kids_safety_score IS NULL OR vq.kids_safety_score >= ?)';
            countParams.push(minScore);
        }
        const countResult = await c.env.DB.prepare(countQuery).bind(...countParams).first() as any;

        return c.json({
            items: videos.results || [],
            total: countResult?.total || 0,
            limit,
            offset
        });
    } catch (e: any) {
        console.error('[Safety] Queue fetch error:', e);
        return c.json({ error: e.message }, 500);
    }
});

// Evaluate videos for safety (AI scoring)
app.post('/api/safety/evaluate', async (c) => {
    const user = c.get('user');
    if (!user || (user.id !== 1 && user.email !== 'admin@kfytube.com')) {
        return c.json({ error: 'Admin only' }, 403);
    }

    const body = await c.req.json();
    const { video_ids } = body;

    if (!video_ids || !Array.isArray(video_ids) || video_ids.length === 0) {
        return c.json({ error: 'video_ids array is required' }, 400);
    }

    try {
        const results: any[] = [];
        let evaluated = 0;
        let failed = 0;

        // Get videos to evaluate
        const placeholder = video_ids.map(() => '?').join(',');
        const videos = await c.env.DB.prepare(`
            SELECT id, youtube_video_id, title, channel_id
            FROM video_queue
            WHERE id IN (${placeholder})
        `).bind(...video_ids).all();

        // Evaluate each video
        for (const video of videos.results || []) {
            try {
                console.log(`[Safety] Evaluating video: ${video.title}`);
                const evaluation = await evaluateVideoSafetyForKids(
                    video.title,
                    '',  // No description available from queue
                    c.env.AI
                );

                // Update database
                await c.env.DB.prepare(`
                    UPDATE video_queue
                    SET kids_safety_score = ?, safety_review_status = 'pending', safety_concerns = ?, reviewed_by_ai_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                `).bind(
                    evaluation.score,
                    JSON.stringify(evaluation.concerns),
                    video.id
                ).run();

                results.push({
                    id: video.id,
                    title: video.title,
                    score: evaluation.score,
                    concerns: evaluation.concerns,
                    reasoning: evaluation.reasoning
                });
                evaluated++;
            } catch (evalErr: any) {
                console.error(`[Safety] Failed to evaluate video ${video.id}:`, evalErr);
                failed++;
            }
        }

        return c.json({
            success: true,
            evaluated,
            failed,
            results
        });
    } catch (e: any) {
        console.error('[Safety] Evaluation error:', e);
        return c.json({ error: e.message }, 500);
    }
});

// Review safety evaluation (approve/reject)
app.post('/api/safety/queue/:id/review', async (c) => {
    const user = c.get('user');
    if (!user || (user.id !== 1 && user.email !== 'admin@kfytube.com')) {
        return c.json({ error: 'Admin only' }, 403);
    }

    const videoId = c.req.param('id');
    const body = await c.req.json();
    const { action } = body;  // 'approve' or 'reject'

    if (!['approve', 'reject'].includes(action)) {
        return c.json({ error: 'action must be approve or reject' }, 400);
    }

    try {
        const newStatus = action === 'approve' ? 'approved' : 'rejected';

        const video = await c.env.DB.prepare(`
            UPDATE video_queue
            SET safety_review_status = ?
            WHERE id = ?
            RETURNING *
        `).bind(newStatus, videoId).first();

        if (!video) {
            return c.json({ error: 'Video not found' }, 404);
        }

        return c.json({
            success: true,
            video
        });
    } catch (e: any) {
        console.error('[Safety] Review error:', e);
        return c.json({ error: e.message }, 500);
    }
});

// Get safety statistics
app.get('/api/safety/stats', async (c) => {
    const user = c.get('user');
    if (!user || (user.id !== 1 && user.email !== 'admin@kfytube.com')) {
        return c.json({ error: 'Admin only' }, 403);
    }

    try {
        const stats = await c.env.DB.prepare(`
            SELECT
                COUNT(*) as total,
                SUM(CASE WHEN safety_review_status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN safety_review_status = 'approved' THEN 1 ELSE 0 END) as approved,
                SUM(CASE WHEN safety_review_status = 'rejected' THEN 1 ELSE 0 END) as rejected,
                ROUND(AVG(CASE WHEN kids_safety_score IS NOT NULL THEN kids_safety_score ELSE NULL END), 2) as avg_score,
                MIN(CASE WHEN kids_safety_score IS NOT NULL THEN kids_safety_score ELSE NULL END) as min_score,
                MAX(CASE WHEN kids_safety_score IS NOT NULL THEN kids_safety_score ELSE NULL END) as max_score
            FROM video_queue
        `).first() as any;

        return c.json(stats || {});
    } catch (e: any) {
        console.error('[Safety] Stats error:', e);
        return c.json({ error: e.message }, 500);
    }
});

export default {
    fetch: app.fetch,
    async scheduled(_event: any, env: Bindings, ctx: any) {
        // Run all scheduled tasks
        ctx.waitUntil((async () => {
            await refreshAllChannels(env);
            await discoverNewVideos(env);
            await backfillVideoMetadata(env); // Backfill existing videos
        })());
    }
}
