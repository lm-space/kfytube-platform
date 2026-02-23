<script>
    import { onMount } from "svelte";
    import { playlists, API_BASE, refreshData, token, getApiHeaders } from "../../lib/stores";
    let newName = "";
    let isGlobal = true;
    let newTenantIds = [0]; // Default to global tenant

    // Inline Edit State
    let editingId = null;
    let editName = "";

    // Import State
    let mode = "import"; // 'custom' | 'import'
    let importInput = "";
    let importing = false;
    let refreshingId = null;
    let refreshingNames = false;

    // View Videos State
    let viewingPlaylist = null;
    let playlistVideos = [];
    let loadingVideos = false;

    // Tenant management
    let tenants = [];
    let showTenantModal = false;
    let selectedPlaylist = null;
    let selectedTenantIds = [];

    onMount(async () => {
        await loadTenants();
        await loadPlaylistsWithTenants();
    });

    async function loadTenants() {
        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/tenants`, { headers });
            if (res.ok) {
                tenants = await res.json();
            }
        } catch (e) {
            console.error("Failed to load tenants", e);
        }
    }

    async function loadPlaylistsWithTenants() {
        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/playlists?all_tenants=1`, { headers });
            if (res.ok) {
                const data = await res.json();
                playlists.set(data);
            }
        } catch (e) {
            console.error("Failed to load playlists", e);
        }
    }

    function openTenantModal(pl) {
        selectedPlaylist = pl;
        selectedTenantIds = pl.tenant_ids || [0];
        showTenantModal = true;
    }

    function closeTenantModal() {
        showTenantModal = false;
        selectedPlaylist = null;
        selectedTenantIds = [];
    }

    function toggleTenant(tenantId) {
        if (selectedTenantIds.includes(tenantId)) {
            selectedTenantIds = selectedTenantIds.filter(id => id !== tenantId);
        } else {
            selectedTenantIds = [...selectedTenantIds, tenantId];
        }
    }

    function toggleNewTenant(tenantId) {
        if (newTenantIds.includes(tenantId)) {
            newTenantIds = newTenantIds.filter(id => id !== tenantId);
        } else {
            newTenantIds = [...newTenantIds, tenantId];
        }
    }

    async function saveTenants() {
        if (!selectedPlaylist) return;

        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/playlists/${selectedPlaylist.id}/tenants`, {
                method: "PUT",
                headers,
                body: JSON.stringify({ tenant_ids: selectedTenantIds })
            });

            if (res.ok) {
                await loadPlaylistsWithTenants();
                closeTenantModal();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to update tenants");
            }
        } catch (e) {
            console.error("Failed to update tenants", e);
        }
    }

    function getTenantName(tenantId) {
        if (tenantId === 0) return "Global (Default)";
        const tenant = tenants.find(t => t.id === tenantId);
        return tenant ? tenant.name : `Tenant ${tenantId}`;
    }

    async function handleAdd() {
        if (mode === "custom") {
            create();
        } else {
            importPlaylist();
        }
    }

    function getHeaders() {
        return {
            "Content-Type": "application/json",
            Authorization: `Bearer ${$token}`,
        };
    }

    async function create() {
        if (!newName) return;
        if (newTenantIds.length === 0) {
            alert("Please select at least one tenant/subdomain");
            return;
        }
        const headers = getApiHeaders();
        await fetch(API_BASE + "/playlists", {
            method: "POST",
            headers,
            body: JSON.stringify({ name: newName, is_global: isGlobal, tenant_ids: newTenantIds }),
        });
        newName = "";
        isGlobal = true;
        newTenantIds = [0];
        await loadPlaylistsWithTenants();
    }

    // CORS proxy list with fallbacks
    const CORS_PROXIES = [
        (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
        (url) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
        (url) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    ];

    // Fetch via CORS proxy with fallbacks
    async function proxyFetch(url) {
        let lastError = null;

        for (const makeProxyUrl of CORS_PROXIES) {
            const proxyUrl = makeProxyUrl(url);
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

                const res = await fetch(proxyUrl, { signal: controller.signal });
                clearTimeout(timeoutId);

                if (res.ok) {
                    return res;
                }
                lastError = new Error(`HTTP ${res.status}`);
            } catch (e) {
                console.warn(`Proxy failed: ${proxyUrl.split('?')[0]}`, e);
                lastError = e;
            }
        }

        // All proxies failed
        throw lastError || new Error("All CORS proxies failed");
    }

    // Resolve channel ID and name from YouTube page HTML
    async function resolveChannelInfoClient(input) {
        let channelId = null;
        let channelName = null;

        // If already a UC ID, we still need to fetch the name
        if (input.startsWith("UC") && input.length >= 24) {
            channelId = input;
        }

        let targetUrl = input;
        if (input.startsWith("@")) {
            targetUrl = `https://www.youtube.com/${input}`;
        } else if (
            !input.includes("youtube.com/") &&
            !input.includes("youtu.be/")
        ) {
            targetUrl = `https://www.youtube.com/@${input}`;
        } else if (input.startsWith("UC")) {
            targetUrl = `https://www.youtube.com/channel/${input}`;
        }

        try {
            const res = await proxyFetch(targetUrl);
            if (res.ok) {
                const text = await res.text();

                // Extract channel ID if not already known
                if (!channelId) {
                    const idPatterns = [
                        /channel_id=(UC[\w-]+)/,
                        /"externalId":"(UC[\w-]+)"/,
                        /"channelId":"(UC[\w-]+)"/,
                        /"browseId":"(UC[\w-]+)"/,
                        /<meta itemprop="channelId" content="(UC[\w-]+)">/,
                    ];
                    for (const p of idPatterns) {
                        const m = p.exec(text);
                        if (m && m[1]) {
                            channelId = m[1];
                            break;
                        }
                    }
                }

                // Extract channel name
                const namePatterns = [
                    /<meta property="og:title" content="([^"]+)">/,
                    /<title>([^<]+)<\/title>/,
                    /"author":"([^"]+)"/,
                    /"name":"([^"]+)"/,
                ];
                for (const p of namePatterns) {
                    const m = p.exec(text);
                    if (m && m[1]) {
                        channelName = m[1].replace(/ - YouTube$/, '').trim();
                        break;
                    }
                }
            }
        } catch (e) {
            console.warn("Client-side channel info resolve failed", e);
        }

        return { channelId, channelName };
    }

    // Fetch videos from YouTube RSS feed via CORS proxy (returns ~15 latest)
    async function fetchRSSVideosClient(channelId) {
        const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
        try {
            const res = await proxyFetch(rssUrl);
            if (res.ok) {
                const text = await res.text();
                const videos = [];
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
        } catch (e) {
            console.warn("RSS fetch failed", e);
        }
        return null;
    }

    // Fetch more videos via Invidious API (up to 60 per page)
    async function fetchInvidiousVideosClient(channelId) {
        const instances = [
            'https://inv.tux.pizza',
            'https://vid.puffyan.us',
            'https://invidious.projectsegfau.lt'
        ];

        for (const host of instances) {
            try {
                // Fetch first page (up to 60 videos)
                const res = await proxyFetch(`${host}/api/v1/channels/${channelId}/videos?sort_by=newest`);
                if (res.ok) {
                    const data = await res.json();
                    return data.map((v) => ({
                        id: v.videoId,
                        title: v.title,
                    }));
                }
            } catch (e) {
                console.warn(`Invidious ${host} failed`, e);
            }
        }
        return null;
    }

    async function importPlaylist() {
        if (!importInput.trim()) {
            alert("Please enter a valid Channel URL or ID");
            return;
        }
        importing = true;

        try {
            // Step 1: Resolve channel ID and name client-side
            console.log("Resolving channel info client-side...");
            const { channelId, channelName } = await resolveChannelInfoClient(importInput.trim());

            if (!channelId) {
                // Fallback to server-side resolution
                console.log("Client resolution failed, falling back to server...");
                const res = await fetch(API_BASE + "/playlists/import", {
                    method: "POST",
                    headers: getHeaders(),
                    body: JSON.stringify({ channel_id: importInput.trim() }),
                });
                if (res.ok) {
                    const data = await res.json();
                    alert(`Imported ${data.count} videos into new playlist!`);
                    importInput = "";
                    refreshData();
                } else {
                    const err = await res.json();
                    alert("Import Failed: " + (err.error || "Unknown"));
                }
                importing = false;
                return;
            }

            console.log("Resolved:", { channelId, channelName });

            // Step 2: Try Invidious first for more videos (up to 60), then RSS fallback
            console.log("Fetching videos via Invidious...");
            let videos = await fetchInvidiousVideosClient(channelId);

            if (!videos || videos.length === 0) {
                console.log("Invidious failed, trying RSS feed...");
                videos = await fetchRSSVideosClient(channelId);
            }

            if (!videos || videos.length === 0) {
                // Fallback to server if all client-side methods fail
                console.log("Client-side fetch failed, falling back to server...");
                const res = await fetch(API_BASE + "/playlists/import", {
                    method: "POST",
                    headers: getHeaders(),
                    body: JSON.stringify({ channel_id: channelId }),
                });
                if (res.ok) {
                    const data = await res.json();
                    alert(`Imported ${data.count} videos into new playlist!`);
                    importInput = "";
                    refreshData();
                } else {
                    const err = await res.json();
                    alert("Import Failed: " + (err.error || "Unknown"));
                }
                importing = false;
                return;
            }

            console.log(`Fetched ${videos.length} videos client-side`);

            // Step 3: Send pre-fetched data to server (minimal worker usage)
            const res = await fetch(API_BASE + "/playlists/import-bulk", {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({
                    channel_id: channelId,
                    channel_name: channelName || channelId,
                    videos: videos
                }),
            });

            if (res.ok) {
                const data = await res.json();
                alert(`Imported ${data.count} videos into new playlist!`);
                importInput = "";
                refreshData();
            } else {
                const err = await res.json();
                alert("Import Failed: " + (err.error || "Unknown"));
            }
        } catch (e) {
            console.error(e);
            alert("Network Error: " + (e instanceof Error ? e.message : String(e)));
        }
        importing = false;
    }

    async function refreshPlaylist(id) {
        if (
            !confirm(
                "Refresh this playlist from the source channel? This will update the video list.",
            )
        )
            return;
        refreshingId = id;
        try {
            const res = await fetch(`${API_BASE}/playlists/${id}/refresh`, {
                method: "POST",
                headers: getHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Refreshed! Playlist now has ${data.count} videos.`);
                refreshData();
            } else {
                alert("Refresh Failed");
            }
        } catch (e) {
            console.error(e);
        }
        refreshingId = null;
    }

    async function del(id) {
        if (
            !confirm(
                "Delete playlist? This will remove all videos from this playlist.",
            )
        )
            return;
        await fetch(`${API_BASE}/playlists/${id}`, { method: "DELETE" });
        refreshData();
    }

    function startEdit(p) {
        editingId = p.id;
        editName = p.name;
        setTimeout(() => {
            const el = document.getElementById(`edit-pl-${p.id}`);
            if (el) el.focus();
        }, 0);
    }

    async function saveEdit(id) {
        if (!editName.trim()) return cancelEdit();

        const original = $playlists.find((p) => p.id === id);
        if (original && original.name === editName) {
            cancelEdit();
            return;
        }

        await fetch(`${API_BASE}/playlists/${id}`, {
            method: "PUT",
            headers: getHeaders(),
            body: JSON.stringify({ name: editName }),
        });

        // Optimistic
        playlists.update((all) =>
            all.map((p) => (p.id === id ? { ...p, name: editName } : p)),
        );
        cancelEdit();
    }

    function cancelEdit() {
        editingId = null;
        editName = "";
    }

    async function toggleFeatured(pl) {
        const newVal = pl.is_featured ? 0 : 1;
        const headers = getApiHeaders();
        await fetch(`${API_BASE}/playlists/${pl.id}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ is_featured: newVal }),
        });
        playlists.update((all) =>
            all.map((p) => (p.id === pl.id ? { ...p, is_featured: newVal } : p)),
        );
    }

    async function toggleRepeat(pl) {
        const newVal = pl.repeat_enabled ? 0 : 1;
        const headers = getApiHeaders();
        await fetch(`${API_BASE}/playlists/${pl.id}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ repeat_enabled: newVal }),
        });
        playlists.update((all) =>
            all.map((p) => (p.id === pl.id ? { ...p, repeat_enabled: newVal } : p)),
        );
    }

    function handleKeydown(e, id) {
        if (e.key === "Enter") saveEdit(id);
        if (e.key === "Escape") cancelEdit();
    }

    // DND
    let draggedItem = null;
    let dragOverItem = null;

    function handleDragStart(e, item) {
        draggedItem = item;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify(item));
        setTimeout(() => e.target.classList.add("dragging"), 0);
    }

    function handleDragEnd(e) {
        e.target.classList.remove("dragging");
        draggedItem = null;
        dragOverItem = null;
    }

    function handleDragOver(e, item) {
        e.preventDefault();
        if (draggedItem === item) return;
        dragOverItem = item;
    }

    async function handleDrop(e, targetItem) {
        e.preventDefault();
        if (!draggedItem || draggedItem === targetItem) return;

        const all = [...$playlists];
        const fromIndex = all.indexOf(draggedItem);
        const toIndex = all.indexOf(targetItem);

        if (fromIndex < 0 || toIndex < 0) return;

        all.splice(fromIndex, 1);
        all.splice(toIndex, 0, draggedItem);

        playlists.set(all);
        await saveOrder(all);
        draggedItem = null;
        dragOverItem = null;
    }

    async function saveOrder(items) {
        const payload = items.map((p, idx) => ({
            id: p.id,
            display_order: idx,
        }));
        await fetch(`${API_BASE}/playlists/reorder`, {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    async function deletePlaylist(id) {
        if (!confirm("Delete this playlist?")) return;
        try {
            const res = await fetch(`${API_BASE}/playlists/${id}`, {
                method: "DELETE",
                headers: getHeaders(),
            });
            if (!res.ok) {
                const err = await res.json();
                alert(err.error || "Delete failed");
            }
        } catch (e) {
            console.error(e);
            alert("Network Error");
        }
        refreshData();
    }

    // Helper function to get display name (channel name without ID)
    function getDisplayName(playlist) {
        if (!playlist.name) return 'Untitled';
        // If it's a "Name - UC..." format, extract just the name
        if (playlist.source_channel_id && playlist.name.includes(' - ')) {
            return playlist.name.split(' - ')[0];
        }
        return playlist.name;
    }

    // Check if a playlist name needs refresh (shows as ID)
    function needsNameRefresh(playlist) {
        if (!playlist.source_channel_id) return false;
        const displayName = getDisplayName(playlist);
        // If name starts with UC and is 24+ chars, it's likely an ID
        return displayName.startsWith('UC') && displayName.length >= 24;
    }

    // Refresh channel names for all imported channels
    async function refreshChannelNames() {
        if (!confirm("Refresh channel names from YouTube? This may take a moment.")) return;
        refreshingNames = true;
        try {
            const res = await fetch(`${API_BASE}/channels/refresh-names`, {
                method: "POST",
                headers: getHeaders(),
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Updated ${data.updated} channel name(s).`);
                refreshData();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to refresh names");
            }
        } catch (e) {
            console.error(e);
            alert("Network Error");
        }
        refreshingNames = false;
    }

    async function viewPlaylistVideos(playlist) {
        viewingPlaylist = playlist;
        loadingVideos = true;
        playlistVideos = [];

        try {
            const res = await fetch(`${API_BASE}/videos?playlist_id=${playlist.id}`);
            if (res.ok) {
                const data = await res.json();
                playlistVideos = Array.isArray(data) ? data : data.items || [];
            }
        } catch (e) {
            console.error(e);
        }
        loadingVideos = false;
    }

    function closeVideoView() {
        viewingPlaylist = null;
        playlistVideos = [];
    }

    async function removeVideoFromPlaylist(videoId) {
        if (!viewingPlaylist) return;
        if (!confirm("Remove this video from the playlist?")) return;

        try {
            const res = await fetch(`${API_BASE}/playlists/${viewingPlaylist.id}/videos/${videoId}`, {
                method: "DELETE",
                headers: getHeaders(),
            });
            if (res.ok) {
                // Remove from local list
                playlistVideos = playlistVideos.filter(v => v.id !== videoId);
            } else {
                const err = await res.json();
                alert(err.error || "Failed to remove video");
            }
        } catch (e) {
            console.error(e);
            alert("Network Error");
        }
    }
</script>

<div class="total-banner">
    <span class="total-count">{$playlists.length}</span>
    <span class="total-label">Total Playlists / Channels</span>
</div>

<div class="card">
    <div class="header-row">
        <h2>Playlists</h2>
        {#if $playlists.some(p => needsNameRefresh(p))}
            <button
                class="refresh-names-btn"
                on:click={refreshChannelNames}
                disabled={refreshingNames}
                title="Some channel names are showing as IDs. Click to refresh."
            >
                {refreshingNames ? "⏳ Refreshing..." : "🔄 Fix Channel Names"}
            </button>
        {/if}
    </div>

    <div class="controls-area">
        <div class="mode-selector">
            <span class="mode-label">Type:</span>
            <label class="radio-label {mode === 'custom' ? 'active' : ''}">
                <input type="radio" bind:group={mode} value="custom" /> Custom Empty
            </label>
            <label class="radio-label {mode === 'import' ? 'active' : ''}">
                <input type="radio" bind:group={mode} value="import" /> Import Channel
            </label>
        </div>

        <div class="input-row">
            {#if mode === "custom"}
                <input
                    type="text"
                    placeholder="New Playlist Name"
                    bind:value={newName}
                    on:keydown={(e) => e.key === "Enter" && handleAdd()}
                />
                <label title="Available to all channels" class="checkbox-label">
                    <input type="checkbox" bind:checked={isGlobal} /> Global
                </label>
                <div class="tenant-selector">
                    <span class="tenant-label">Subdomains:</span>
                    <label class="tenant-checkbox">
                        <input type="checkbox" checked={newTenantIds.includes(0)} on:change={() => toggleNewTenant(0)} />
                        Global
                    </label>
                    {#each tenants as tenant}
                        <label class="tenant-checkbox">
                            <input type="checkbox" checked={newTenantIds.includes(tenant.id)} on:change={() => toggleNewTenant(tenant.id)} />
                            {tenant.name}
                        </label>
                    {/each}
                </div>
            {:else}
                <input
                    type="text"
                    placeholder="Channel URL (youtube.com/@handle) or ID (UC...)"
                    bind:value={importInput}
                    class="code-input"
                    on:keydown={(e) => e.key === "Enter" && handleAdd()}
                />
            {/if}

            <button
                on:click={handleAdd}
                disabled={importing}
                class={mode === "import" ? "btn-import" : ""}
            >
                {mode === "import" && importing
                    ? "⏳ ..."
                    : mode === "import"
                      ? "📥 Import Top 100"
                      : "➕ Create"}
            </button>
        </div>
    </div>

    <div class="list">
        {#each $playlists as p (p.id)}
            <div
                class="item"
                draggable="true"
                on:dragstart={(e) => handleDragStart(e, p)}
                on:dragend={handleDragEnd}
                on:dragover={(e) => handleDragOver(e, p)}
                on:drop={(e) => handleDrop(e, p)}
            >
                {#if editingId === p.id}
                    <input
                        id="edit-pl-{p.id}"
                        type="text"
                        bind:value={editName}
                        on:blur={() => saveEdit(p.id)}
                        on:keydown={(e) => handleKeydown(e, p.id)}
                        class="edit-input"
                    />
                {:else}
                    <div class="name-row">
                        <div class="drag-handle">⋮⋮</div>
                        <span
                            class="name"
                            class:needs-refresh={needsNameRefresh(p)}
                            title={p.source_channel_id ? `${p.name}\nClick to edit` : "Click to edit"}
                            on:click={() => startEdit(p)}
                        >
                            {getDisplayName(p)}
                        </span>

                        {#if p.source_channel_id}
                            <span
                                class="badge-source"
                                title="Synced with YouTube Channel: {p.source_channel_id}">Channel</span
                            >
                            <button
                                class="icon-btn sync-btn"
                                on:click|stopPropagation={() =>
                                    refreshPlaylist(p.id)}
                                title="Refresh from Channel"
                                disabled={refreshingId === p.id}
                            >
                                {refreshingId === p.id ? "⏳" : "🔄"}
                            </button>
                        {/if}

                        <button class="icon-btn" on:click={() => startEdit(p)}>✎</button>
                        <button
                            class="icon-btn view-btn"
                            on:click|stopPropagation={() => viewPlaylistVideos(p)}
                            title="View Videos"
                        >
                            👁
                        </button>
                    </div>
                {/if}
                <div class="item-actions">
                    <div class="tenant-badges">
                        {#each (p.tenant_ids || []) as tid}
                            <span class="tenant-badge" class:global={tid === 0}>{getTenantName(tid)}</span>
                        {/each}
                    </div>
                    <button
                        class="btn-featured"
                        class:active={p.is_featured}
                        on:click={() => toggleFeatured(p)}
                        title={p.is_featured ? 'Remove from featured' : 'Mark as featured'}
                    >
                        {p.is_featured ? '★' : '☆'}
                    </button>
                    <button
                        class="btn-repeat"
                        class:active={p.repeat_enabled}
                        on:click={() => toggleRepeat(p)}
                        title={p.repeat_enabled ? 'Disable repeat' : 'Enable repeat'}
                    >
                        {p.repeat_enabled ? '🔁' : '→'}
                    </button>
                    <button class="btn-tenants" on:click={() => openTenantModal(p)}>Subdomains</button>
                    <button class="btn-danger" on:click={() => deletePlaylist(p.id)}>Delete</button>
                </div>
            </div>
        {/each}
    </div>
</div>

<!-- Tenant Assignment Modal -->
{#if showTenantModal && selectedPlaylist}
    <div class="modal-overlay" on:click={closeTenantModal}>
        <div class="modal" on:click|stopPropagation>
            <div class="modal-header">
                <h3>Assign Subdomains - {selectedPlaylist.name}</h3>
                <button class="close-btn" on:click={closeTenantModal}>&times;</button>
            </div>
            <div class="modal-body">
                <p class="modal-help">Select which subdomains this playlist should appear in:</p>
                <div class="tenant-list">
                    <label class="tenant-option">
                        <input type="checkbox" checked={selectedTenantIds.includes(0)} on:change={() => toggleTenant(0)} />
                        <span class="tenant-name">Global (Default)</span>
                        <span class="tenant-url">tube.twozao.com</span>
                    </label>
                    {#each tenants as tenant}
                        <label class="tenant-option">
                            <input type="checkbox" checked={selectedTenantIds.includes(tenant.id)} on:change={() => toggleTenant(tenant.id)} />
                            <span class="tenant-name">{tenant.name}</span>
                            <span class="tenant-url">{tenant.slug}.tube.twozao.com</span>
                        </label>
                    {/each}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" on:click={closeTenantModal}>Cancel</button>
                <button class="btn-primary" on:click={saveTenants}>Save</button>
            </div>
        </div>
    </div>
{/if}

<!-- Video View Panel -->
{#if viewingPlaylist}
    <div class="video-panel-overlay" on:click={closeVideoView}>
        <div class="video-panel" on:click|stopPropagation>
            <div class="panel-header">
                <h3>{viewingPlaylist.name}</h3>
                <button class="close-btn" on:click={closeVideoView}>×</button>
            </div>

            <div class="panel-body">
                {#if loadingVideos}
                    <div class="loading">Loading videos...</div>
                {:else if playlistVideos.length === 0}
                    <div class="empty">No videos in this playlist.</div>
                {:else}
                    <div class="video-count">{playlistVideos.length} videos</div>
                    <div class="video-list">
                        {#each playlistVideos as video, index}
                            <div class="video-item">
                                <span class="video-index">{index + 1}</span>
                                {#if video.source_type === "youtube" || !video.source_type}
                                    <img
                                        src="https://img.youtube.com/vi/{video.youtube_id}/default.jpg"
                                        alt=""
                                        class="video-thumb"
                                    />
                                {:else}
                                    <div class="video-thumb placeholder {video.source_type}">
                                        {video.source_type}
                                    </div>
                                {/if}
                                <div class="video-info">
                                    <div class="video-title">{video.title}</div>
                                    <div class="video-id">{video.youtube_id}</div>
                                </div>
                                <button
                                    class="video-delete-btn"
                                    on:click={() => removeVideoFromPlaylist(video.id)}
                                    title="Remove from playlist"
                                >
                                    ×
                                </button>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    /* Total Banner */
    .total-banner {
        background: linear-gradient(135deg, #9c27b0, #7b1fa2);
        color: white;
        padding: var(--space-lg) var(--space-xl);
        border-radius: var(--radius-lg);
        margin-bottom: var(--space-xl);
        display: flex;
        align-items: center;
        gap: var(--space-md);
        box-shadow: var(--shadow-md);
    }

    .total-count {
        font-size: 2.5rem;
        font-weight: 700;
        line-height: 1;
    }

    .total-label {
        font-size: 1rem;
        opacity: 0.9;
    }

    /* Card Styles */
    .card {
        background: var(--admin-card);
        padding: var(--space-xl);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
        border: 1px solid var(--admin-border);
    }

    .header-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: var(--space-lg);
        flex-wrap: wrap;
        gap: var(--space-md);
    }

    h2 {
        margin: 0;
        font-size: 1.25rem;
        color: var(--admin-text);
        display: flex;
        align-items: center;
        gap: var(--space-sm);
    }

    h2::before {
        content: '📺';
    }

    .refresh-names-btn {
        background: #f59e0b !important;
        padding: var(--space-sm) var(--space-md);
        font-size: 0.8rem;
    }

    .refresh-names-btn:hover {
        background: #d97706 !important;
    }

    .refresh-names-btn:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
    }

    /* Controls Area */
    .controls-area {
        display: flex;
        flex-direction: column;
        gap: var(--space-md);
        margin-bottom: var(--space-xl);
        background: var(--admin-bg);
        padding: var(--space-lg);
        border-radius: var(--radius-md);
        border: 1px solid var(--admin-border);
    }

    .mode-selector {
        display: flex;
        align-items: center;
        gap: var(--space-lg);
        flex-wrap: wrap;
    }

    .mode-label {
        font-weight: 600;
        font-size: 0.875rem;
        color: var(--admin-text);
    }

    .radio-label {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        font-size: 0.875rem;
        cursor: pointer;
        color: var(--admin-text-muted);
        padding: var(--space-sm) var(--space-md);
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
    }

    .radio-label:hover {
        background: white;
    }

    .radio-label.active {
        color: var(--admin-primary);
        font-weight: 500;
        background: white;
    }

    .radio-label input[type="radio"] {
        accent-color: var(--admin-primary);
    }

    .input-row {
        display: flex;
        gap: var(--space-sm);
        align-items: center;
        flex-wrap: wrap;
    }

    .input-row input[type="text"] {
        flex: 1;
        min-width: 200px;
        padding: var(--space-md);
        border: 1px solid var(--admin-border);
        border-radius: var(--radius-md);
        font-size: 0.875rem;
        transition: all var(--transition-fast);
    }

    .input-row input[type="text"]:focus {
        outline: none;
        border-color: var(--admin-primary);
        box-shadow: 0 0 0 3px var(--admin-primary-light);
    }

    .code-input {
        font-family: monospace;
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        font-size: 0.875rem;
        color: var(--admin-text-muted);
        white-space: nowrap;
    }

    .checkbox-label input[type="checkbox"] {
        accent-color: var(--admin-primary);
    }

    button {
        padding: var(--space-md) var(--space-lg);
        background: var(--admin-primary);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        font-weight: 600;
        font-size: 0.875rem;
        white-space: nowrap;
        transition: all var(--transition-fast);
    }

    button:hover {
        background: var(--admin-primary-hover);
        transform: translateY(-1px);
    }

    button:active {
        transform: translateY(0);
    }

    .btn-import {
        background: var(--admin-secondary);
    }

    .btn-import:hover {
        background: #475569;
    }

    .btn-import:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
    }

    /* Playlist List */
    .list {
        display: flex;
        flex-direction: column;
    }

    .item {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-md) var(--space-lg);
        border-bottom: 1px solid var(--admin-border);
        background: white;
        transition: all var(--transition-fast);
    }

    .item:hover {
        background: var(--admin-bg);
    }

    .item:last-child {
        border-bottom: none;
    }

    .item.dragging {
        opacity: 0.5;
        background: var(--admin-primary-light);
        border: 2px dashed var(--admin-primary);
    }

    .btn-danger {
        background: var(--admin-danger) !important;
        padding: var(--space-sm) var(--space-md);
        font-size: 0.8rem;
    }

    .btn-danger:hover {
        background: #dc2626 !important;
    }

    .name-row {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        flex: 1;
        min-width: 0;
    }

    .drag-handle {
        cursor: grab;
        color: var(--admin-text-light);
        margin-right: var(--space-md);
        font-weight: bold;
        user-select: none;
        opacity: 0.5;
        transition: opacity var(--transition-fast);
    }

    .item:hover .drag-handle {
        opacity: 1;
    }

    .name {
        font-weight: 500;
        cursor: pointer;
        margin-right: var(--space-sm);
        color: var(--admin-text);
        transition: color var(--transition-fast);
        max-width: 250px;
        overflow: hidden;
        white-space: nowrap;
        padding: 4px 8px;
        background: var(--admin-bg);
        border-radius: var(--radius-sm);
    }

    .name:hover {
        color: var(--admin-primary);
    }

    .name.needs-refresh {
        color: #f59e0b;
        font-family: monospace;
        direction: rtl;
        text-align: left;
        font-size: 0.8rem;
    }

    .badge-source {
        background: var(--admin-primary-light);
        color: var(--admin-primary);
        padding: 2px 8px;
        border-radius: var(--radius-sm);
        font-size: 0.7rem;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.02em;
    }

    .edit-input {
        font-size: 0.875rem;
        padding: var(--space-sm);
        border: 2px solid var(--admin-primary);
        border-radius: var(--radius-sm);
        max-width: 300px;
    }

    .edit-input:focus {
        outline: none;
        box-shadow: 0 0 0 3px var(--admin-primary-light);
    }

    .icon-btn {
        background: none !important;
        border: none;
        padding: var(--space-xs);
        font-size: 1rem;
        cursor: pointer;
        color: var(--admin-text-light);
        transition: all var(--transition-fast);
        border-radius: var(--radius-sm);
        opacity: 0;
    }

    .item:hover .icon-btn {
        opacity: 1;
    }

    .icon-btn:hover {
        color: var(--admin-primary) !important;
        background: var(--admin-primary-light) !important;
        transform: none;
    }

    .sync-btn {
        color: var(--admin-success) !important;
    }

    .sync-btn:hover {
        color: #047857 !important;
        background: var(--admin-success-light) !important;
    }

    .view-btn {
        color: #6366f1 !important;
    }

    .view-btn:hover {
        color: #4f46e5 !important;
        background: #eef2ff !important;
    }

    /* Video Panel Overlay */
    .video-panel-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.6);
        display: flex;
        justify-content: center;
        align-items: center;
        z-index: 1000;
        padding: var(--space-md);
        animation: fadeIn 0.2s ease-out;
    }

    @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
    }

    .video-panel {
        background: var(--admin-card);
        border-radius: var(--radius-xl);
        width: 100%;
        max-width: 800px;
        max-height: 85vh;
        display: flex;
        flex-direction: column;
        box-shadow: var(--shadow-xl);
        animation: slideUp 0.3s ease-out;
    }

    @keyframes slideUp {
        from {
            opacity: 0;
            transform: translateY(20px);
        }
        to {
            opacity: 1;
            transform: translateY(0);
        }
    }

    .panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-lg) var(--space-xl);
        border-bottom: 1px solid var(--admin-border);
        background: var(--admin-bg);
        border-radius: var(--radius-xl) var(--radius-xl) 0 0;
    }

    .panel-header h3 {
        margin: 0;
        font-size: 1.25rem;
        color: var(--admin-text);
        display: flex;
        align-items: center;
        gap: var(--space-sm);
    }

    .panel-header h3::before {
        content: '🎬';
    }

    .close-btn {
        background: none !important;
        border: none;
        font-size: 1.5rem;
        cursor: pointer;
        color: var(--admin-text-light);
        padding: 0;
        line-height: 1;
        width: 32px;
        height: 32px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
    }

    .close-btn:hover {
        color: var(--admin-text) !important;
        background: var(--admin-border) !important;
        transform: none;
    }

    .panel-body {
        padding: var(--space-lg) var(--space-xl);
        overflow-y: auto;
        flex: 1;
    }

    .video-count {
        color: var(--admin-text-muted);
        font-size: 0.875rem;
        margin-bottom: var(--space-md);
        padding: var(--space-sm) var(--space-md);
        background: var(--admin-bg);
        border-radius: var(--radius-md);
        display: inline-block;
    }

    .video-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
    }

    .video-item {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        padding: var(--space-md);
        background: var(--admin-bg);
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
        border: 1px solid transparent;
    }

    .video-item:hover {
        background: white;
        border-color: var(--admin-border);
        box-shadow: var(--shadow-sm);
    }

    .video-index {
        color: var(--admin-text-light);
        font-size: 0.8rem;
        min-width: 28px;
        text-align: center;
        font-weight: 500;
    }

    .video-thumb {
        width: 80px;
        height: 45px;
        object-fit: cover;
        border-radius: var(--radius-sm);
        background: var(--admin-border);
        flex-shrink: 0;
    }

    .video-thumb.placeholder {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.65rem;
        color: white;
        text-transform: uppercase;
        font-weight: 600;
    }

    .video-thumb.twitter { background: #1da1f2; }
    .video-thumb.tiktok { background: #000; }
    .video-thumb.instagram { background: linear-gradient(45deg, #f09433, #dc2743, #bc1888); }
    .video-thumb.facebook { background: #4267b2; }

    .video-info {
        flex: 1;
        min-width: 0;
    }

    .video-title {
        font-weight: 500;
        font-size: 0.875rem;
        color: var(--admin-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .video-id {
        font-size: 0.7rem;
        color: var(--admin-text-light);
        font-family: monospace;
        margin-top: 2px;
    }

    .loading, .empty {
        text-align: center;
        color: var(--admin-text-muted);
        padding: var(--space-2xl);
        font-style: italic;
    }

    .video-delete-btn {
        background: none !important;
        border: none;
        color: var(--admin-text-light);
        font-size: 1.25rem;
        cursor: pointer;
        padding: var(--space-xs) var(--space-sm);
        border-radius: var(--radius-sm);
        transition: all var(--transition-fast);
        opacity: 0;
    }

    .video-item:hover .video-delete-btn {
        opacity: 1;
    }

    .video-delete-btn:hover {
        background: var(--admin-danger-light) !important;
        color: var(--admin-danger) !important;
        transform: none;
    }

    /* Responsive */
    @media (max-width: 768px) {
        .card {
            padding: var(--space-lg);
        }

        .controls-area {
            padding: var(--space-md);
        }

        .mode-selector {
            flex-direction: column;
            align-items: flex-start;
            gap: var(--space-sm);
        }

        .input-row {
            flex-direction: column;
            align-items: stretch;
        }

        .input-row input[type="text"] {
            min-width: 100%;
        }

        .input-row button {
            width: 100%;
        }

        .item {
            flex-direction: column;
            align-items: stretch;
            gap: var(--space-md);
            padding: var(--space-md);
        }

        .name-row {
            flex-wrap: wrap;
        }

        .btn-danger {
            width: 100%;
        }

        .icon-btn {
            opacity: 1;
        }

        .video-panel {
            max-height: 90vh;
            border-radius: var(--radius-lg);
        }

        .panel-header {
            border-radius: var(--radius-lg) var(--radius-lg) 0 0;
            padding: var(--space-md);
        }

        .panel-body {
            padding: var(--space-md);
        }

        .video-item {
            flex-wrap: wrap;
        }

        .video-delete-btn {
            opacity: 1;
        }
    }

    @media (max-width: 480px) {
        .card {
            padding: var(--space-md);
        }

        h2 {
            font-size: 1.1rem;
        }

        .video-thumb {
            width: 60px;
            height: 34px;
        }

        .video-index {
            display: none;
        }
    }

    /* Tenant Selector in Add Row */
    .tenant-selector {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-sm);
        align-items: center;
        padding: var(--space-sm) 0;
        width: 100%;
    }

    .tenant-label {
        font-size: 0.875rem;
        color: var(--admin-text-muted);
        font-weight: 500;
    }

    .tenant-checkbox {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        font-size: 0.8rem;
        color: var(--admin-text);
        background: var(--admin-card);
        padding: var(--space-xs) var(--space-sm);
        border-radius: var(--radius-sm);
        border: 1px solid var(--admin-border);
        cursor: pointer;
    }

    .tenant-checkbox:hover {
        border-color: var(--admin-primary);
    }

    /* Item Actions */
    .item-actions {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        flex-wrap: wrap;
    }

    .tenant-badges {
        display: flex;
        gap: var(--space-xs);
        flex-wrap: wrap;
    }

    .tenant-badge {
        background: var(--admin-primary-light);
        color: var(--admin-primary);
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.7rem;
        font-weight: 500;
    }

    .tenant-badge.global {
        background: #dcfce7;
        color: #166534;
    }

    .btn-featured {
        background: none !important;
        border: 1px solid var(--admin-border) !important;
        padding: var(--space-sm) var(--space-md);
        font-size: 1.1rem;
        color: #ccc;
        cursor: pointer;
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
    }

    .btn-featured:hover {
        color: #f59e0b;
        border-color: #f59e0b !important;
        transform: none;
    }

    .btn-featured.active {
        color: #f59e0b;
        background: #fef3c7 !important;
        border-color: #f59e0b !important;
    }

    .btn-repeat {
        background: none !important;
        border: 1px solid var(--admin-border) !important;
        padding: var(--space-sm) var(--space-md);
        font-size: 1.1rem;
        color: #ccc;
        cursor: pointer;
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
    }

    .btn-repeat:hover {
        color: #10b981;
        border-color: #10b981 !important;
        transform: none;
    }

    .btn-repeat.active {
        color: #10b981;
        background: #d1fae5 !important;
        border-color: #10b981 !important;
    }

    .btn-tenants {
        background: #f59e0b !important;
        padding: var(--space-sm) var(--space-md);
        font-size: 0.8rem;
    }

    .btn-tenants:hover {
        background: #d97706 !important;
    }

    /* Modal Styles */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: white;
        border-radius: var(--radius-lg);
        width: 90%;
        max-width: 500px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-lg);
        border-bottom: 1px solid var(--admin-border);
    }

    .modal-header h3 {
        margin: 0;
        font-size: 1.1rem;
    }

    .modal-body {
        padding: var(--space-lg);
        overflow-y: auto;
        flex: 1;
    }

    .modal-help {
        color: var(--admin-text-muted);
        font-size: 0.9rem;
        margin: 0 0 var(--space-md) 0;
    }

    .tenant-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
    }

    .tenant-option {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        padding: var(--space-md);
        background: var(--admin-bg);
        border-radius: var(--radius-md);
        cursor: pointer;
        border: 1px solid transparent;
        transition: all var(--transition-fast);
    }

    .tenant-option:hover {
        border-color: var(--admin-primary);
    }

    .tenant-option input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: var(--admin-primary);
    }

    .tenant-name {
        font-weight: 500;
        color: var(--admin-text);
        flex: 1;
    }

    .tenant-url {
        font-size: 0.8rem;
        color: var(--admin-text-muted);
        font-family: monospace;
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-sm);
        padding: var(--space-lg);
        border-top: 1px solid var(--admin-border);
    }

    .btn-secondary {
        background: var(--admin-bg) !important;
        color: var(--admin-text) !important;
        border: 1px solid var(--admin-border) !important;
    }

    .btn-secondary:hover {
        background: var(--admin-border) !important;
    }

    .btn-primary {
        background: var(--admin-primary) !important;
    }
</style>
