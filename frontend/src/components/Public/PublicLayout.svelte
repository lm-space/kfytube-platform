<script lang="ts">
    import { onMount } from "svelte";
    import {
        categories,
        playlists,
        API_BASE,
        refreshData,
        getPublicApiHeaders,
    } from "../../lib/stores";

    let view: "home" | "category" | "playlist" = "home";
    let activeCategory: any = null;
    let activePlaylist: any = null;
    let activeVideos: any[] = [];
    let loading = false;

    // Channels
    let channels: any[] = [];
    let activeChannelId: string | null = null;
    let channelLoading = false;

    let hasUncategorized = false;

    // Imported channel playlists (those with source_channel_id)
    $: importedChannelPlaylists = $playlists.filter((p: any) => p.source_channel_id);

    // Fetch initial metadata
    onMount(async () => {
        const params = new URLSearchParams(window.location.search);
        const headers = getPublicApiHeaders();

        // 1. Load Channels
        try {
            const res = await fetch(`${API_BASE}/channels`, { headers });
            if (res.ok) channels = await res.json();
        } catch (e) {
            console.error(e);
        }

        // 2. Determine Scope
        const channelParam = params.get("channel");
        if (channelParam) activeChannelId = channelParam;

        await loadScopeData();

        // 3. Handle Category Deep Link
        const catId = params.get("cat");
        if (catId) {
            // Find category
            setTimeout(() => {
                const found = $categories.find((c) => c.id == catId); // Loose equality
                if (found) openCategory(found);
            }, 500);
        }
    });

    async function loadScopeData() {
        channelLoading = true;
        // Construct query
        let query = "";
        if (activeChannelId) query = `?channel_id=${activeChannelId}`;

        const headers = getPublicApiHeaders();

        try {
            const [catRes, plRes, uncatRes] = await Promise.all([
                fetch(`${API_BASE}/categories${query}`, { headers }),
                fetch(`${API_BASE}/playlists${query}`, { headers }),
                fetch(
                    `${API_BASE}/videos?category_id=uncategorized&limit=1${activeChannelId ? "&channel_id=" + activeChannelId : ""}`,
                    { headers }
                ),
            ]);

            if (catRes.ok) {
                let cats = await catRes.json();
                cats = cats.filter((c: any) => c.video_count > 0);
                categories.set(cats);
            }
            if (plRes.ok) playlists.set(await plRes.json());

            if (uncatRes.ok) {
                const data = await uncatRes.json();
                hasUncategorized = (data.total || 0) > 0;
            }
        } catch (e) {
            console.error(e);
        }
        channelLoading = false;
    }

    async function switchChannel(id: string | null) {
        if (activeChannelId === id) return;
        activeChannelId = id;

        const url = new URL(window.location.href);
        if (id) {
            url.searchParams.set("channel", id);
        } else {
            url.searchParams.delete("channel");
        }
        // Reset category view on channel switch
        url.searchParams.delete("cat");
        window.history.pushState({}, "", url);

        view = "home";
        activeCategory = null;
        activeVideos = [];

        await loadScopeData();
    }

    async function openCategory(cat: any) {
        activeCategory = cat;
        view = "category";
        loading = true;
        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.set("cat", cat.id);
        window.history.pushState({}, "", url);

        const headers = getPublicApiHeaders();

        try {
            const params = new URLSearchParams();
            if (activeChannelId) params.append("channel_id", activeChannelId);

            if (cat.id === "uncategorized") {
                params.append("category_id", "uncategorized");
            } else if (cat.id !== "all") {
                params.append("category_id", cat.id);
            }

            const res = await fetch(`${API_BASE}/videos?${params.toString()}`, { headers });
            if (res.ok) {
                const data = await res.json();
                let vids = Array.isArray(data) ? data : data.items || [];

                if (cat.id === "all") {
                    // Client-side shuffle for "All" view to look like real YouTube
                    vids = vids.sort(() => 0.5 - Math.random());
                }
                activeVideos = vids;
            }
        } catch (e) {
            console.error(e);
        }
        loading = false;
    }

    async function openPlaylist(pl: any) {
        activePlaylist = pl;
        activeCategory = null;
        view = "playlist";
        loading = true;

        // Update URL
        const url = new URL(window.location.href);
        url.searchParams.delete("cat");
        url.searchParams.set("playlist", pl.id);
        window.history.pushState({}, "", url);

        const headers = getPublicApiHeaders();

        try {
            const res = await fetch(`${API_BASE}/videos?playlist_id=${pl.id}`, { headers });
            if (res.ok) {
                const data = await res.json();
                activeVideos = Array.isArray(data) ? data : data.items || [];
            }
        } catch (e) {
            console.error(e);
        }
        loading = false;
    }

    function goHome() {
        view = "home";
        activeCategory = null;
        activePlaylist = null;
        activeVideos = [];
        const url = new URL(window.location.href);
        url.searchParams.delete("cat");
        url.searchParams.delete("playlist");
        window.history.pushState({}, "", url);
    }

    function openVideo(video: any) {
        // New ID-based routing
        let url = `/watch?id=${video.id}`;

        if (activeCategory) url += `&cat=${activeCategory.id}`;
        if (activeChannelId) url += `&channel=${activeChannelId}`;
        window.location.href = url;
    }
</script>

<svelte:head>
    <title>Tube App</title>
</svelte:head>

<div class="app-container">
    {#if view === "home"}
        <!-- Home View: Category List -->
        {#if channelLoading}
            <div class="loading">Loading Channel Content...</div>
        {:else}
            <div class="grid-container">
                <button
                    class="category-card"
                    on:click={() =>
                        openCategory({ id: "all", name: "All Videos" })}
                >
                    <div class="cat-name">All Videos</div>
                    <!-- <div class="cat-count">Mix Mode →</div> -->
                </button>

                {#each $categories as cat}
                    <button
                        class="category-card"
                        on:click={() => openCategory(cat)}
                    >
                        <div class="cat-name">{cat.name}</div>
                        <!-- <div class="cat-count">View Videos →</div> -->
                    </button>
                {/each}

                {#if hasUncategorized}
                    <button
                        class="category-card"
                        on:click={() =>
                            openCategory({
                                id: "uncategorized",
                                name: "Other",
                            })}
                    >
                        <div class="cat-name">Other</div>
                        <!-- <div class="cat-count">Uncategorized →</div> -->
                    </button>
                {/if}
            </div>

            {#if importedChannelPlaylists.length > 0}
                <div class="separator"></div>
                <div class="section-title">Channels</div>
                <div class="grid-container">
                    {#each importedChannelPlaylists as pl}
                        <button
                            class="category-card channel-card"
                            on:click={() => openPlaylist(pl)}
                        >
                            <div class="cat-name">{pl.name.split(' - ')[0]}</div>
                            <div class="channel-badge">YouTube Channel</div>
                        </button>
                    {/each}
                </div>
            {/if}
        {/if}
    {:else if view === "category" && activeCategory}
        <!-- Category View -->
        <div class="nav-header">
            <button class="back-btn" on:click={goHome}>
                <span class="arrow">←</span> Back
            </button>
            <h2>{activeCategory.name}</h2>
        </div>

        {#if loading}
            <div class="loading">Loading videos...</div>
        {:else if activeVideos.length === 0}
            <div class="empty">No videos in this category.</div>
        {:else}
            <div class="video-grid">
                {#each activeVideos as video}
                    <button
                        class="video-card"
                        on:click={() => openVideo(video)}
                    >
                        <div class="thumb-wrapper">
                            {#if (!video.source_type && (!video.thumbnail_url || video.thumbnail_url.startsWith("http"))) || video.source_type === "youtube"}
                                <img
                                    src={`https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`}
                                    loading="lazy"
                                    alt={video.title}
                                />
                            {:else}
                                {@const type =
                                    video.source_type || video.thumbnail_url}
                                <div class="thumb-placeholder {type}">
                                    <span class="badg">{type}</span>
                                </div>
                            {/if}
                        </div>
                        <div class="content">
                            <div class="video-title">{video.title}</div>
                        </div>
                    </button>
                {/each}
            </div>
        {/if}
    {:else if view === "playlist" && activePlaylist}
        <!-- Playlist/Channel View -->
        <div class="nav-header">
            <button class="back-btn" on:click={goHome}>
                <span class="arrow">←</span> Back
            </button>
            <h2>{activePlaylist.name.split(' - ')[0]}</h2>
        </div>

        {#if loading}
            <div class="loading">Loading videos...</div>
        {:else if activeVideos.length === 0}
            <div class="empty">No videos in this channel.</div>
        {:else}
            <div class="video-grid">
                {#each activeVideos as video}
                    <button
                        class="video-card"
                        on:click={() => openVideo(video)}
                    >
                        <div class="thumb-wrapper">
                            {#if (!video.source_type && (!video.thumbnail_url || video.thumbnail_url.startsWith("http"))) || video.source_type === "youtube"}
                                <img
                                    src={`https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`}
                                    loading="lazy"
                                    alt={video.title}
                                />
                            {:else}
                                {@const type =
                                    video.source_type || video.thumbnail_url}
                                <div class="thumb-placeholder {type}">
                                    <span class="badg">{type}</span>
                                </div>
                            {/if}
                        </div>
                        <div class="content">
                            <div class="video-title">{video.title}</div>
                        </div>
                    </button>
                {/each}
            </div>
        {/if}
    {/if}
</div>

<!-- Home Button -->
<button class="youtube-mode-btn" on:click={() => window.location.href = '/'}>
    <svg viewBox="0 0 24 24" width="20" height="20">
        <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
    </svg>
    Home
</button>

<!-- Bottom Channel Bar -->
<div class="channel-bar-spacer"></div>
<div class="channel-bar">
    <button
        class="channel-pill"
        class:active={activeChannelId === null}
        on:click={() => switchChannel(null)}
    >
        Global
    </button>
    {#each channels as c}
        <button
            class="channel-pill"
            class:active={activeChannelId == c.id}
            on:click={() => switchChannel(c.id)}
        >
            {c.channel_name}
        </button>
    {/each}
</div>

<style>
    .app-container {
        padding: 20px;
        color: white;
        min-height: 100vh;
        padding-bottom: 100px; /* Space for bottom bar */
    }

    /* ... Existing Components ... */

    .grid-container {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 20px;
    }

    .separator {
        height: 1px;
        background: #333;
        margin: 30px 0;
    }

    .category-card {
        background: #252525;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 2rem 1rem;
        cursor: pointer;
        transition: all 0.2s;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 10px;
        color: white;
        text-align: center;
    }
    .category-card:hover {
        background: #333;
        transform: translateY(-2px);
        border-color: #60a5fa;
    }
    .cat-name {
        font-size: 1.2rem;
        font-weight: bold;
    }
    .cat-count {
        font-size: 0.9rem;
        color: #60a5fa;
    }

    .nav-header {
        display: flex;
        align-items: center;
        gap: 20px;
        margin-bottom: 30px;
    }
    .back-btn {
        background: transparent;
        border: 1px solid #444;
        color: white;
        padding: 8px 16px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 1rem;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.2s;
    }
    .back-btn:hover {
        background: #333;
        border-color: white;
    }
    .arrow {
        font-size: 1.2rem;
    }
    h2 {
        margin: 0;
        font-size: 2rem;
    }

    .video-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 20px;
    }

    .video-card {
        background: #252525;
        border-radius: 12px;
        overflow: hidden;
        border: none;
        padding: 0;
        text-align: left;
        cursor: pointer;
        transition: transform 0.2s;
        display: flex;
        flex-direction: column;
    }
    .video-card:hover {
        transform: scale(1.02);
        outline: 2px solid #60a5fa;
    }
    .video-card img {
        width: 100%;
        aspect-ratio: 16/9;
        object-fit: cover;
    }
    .content {
        padding: 12px;
    }
    .video-title {
        font-size: 1rem;
        font-weight: 500;
        color: #eee;
        line-height: 1.4;
    }

    .section-title {
        font-size: 1.25rem;
        color: #aaa;
        margin-bottom: 20px;
        border-bottom: 1px solid #333;
        padding-bottom: 10px;
    }
    .row {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
    }
    .pill {
        padding: 10px 20px;
        background: #333;
        color: #aaa;
        border-radius: 20px;
        border: none;
    }

    .loading,
    .empty {
        padding: 40px;
        text-align: center;
        color: #666;
        font-size: 1.2rem;
    }

    /* Channel Bar */
    .channel-bar {
        position: relative;
        width: 100%;
        background: transparent;
        border-top: 1px solid #333;
        display: flex;
        flex-wrap: wrap; /* Overflow to next line */
        align-items: center;
        justify-content: flex-start; /* From left to right */
        gap: 15px;
        padding: 40px 0; /* Larger padding area around the section */
        margin-top: 40px;
    }
    .channel-pill {
        background: #333;
        color: #aaa;
        border: 1px solid #444;
        padding: 12px 30px; /* Larger pill padding as requested */
        border-radius: 30px;
        cursor: pointer;
        font-size: 1.1rem; /* Slightly larger font */
        white-space: nowrap;
        transition: all 0.2s;
    }
    .channel-pill:hover {
        background: #444;
        color: white;
    }
    .channel-pill.active {
        background: #60a5fa;
        color: white;
        border-color: #60a5fa;
        font-weight: bold;
    }

    /* Hide spacer as it is no longer fixed bottom */
    .channel-bar-spacer {
        display: none;
    }
    .thumb-wrapper {
        width: 100%;
        aspect-ratio: 16/9;
        background: #000;
    }
    .thumb-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        justify-content: center;
        align-items: center;
        font-size: 1.2rem;
        font-weight: bold;
        color: white;
        text-transform: capitalize;
        background: #444;
    }
    .thumb-placeholder.twitter {
        background: #1da1f2;
    }
    .thumb-placeholder.tiktok {
        background: #000000;
    }
    .thumb-placeholder.instagram {
        background: linear-gradient(
            45deg,
            #f09433 0%,
            #e6683c 25%,
            #dc2743 50%,
            #cc2366 75%,
            #bc1888 100%
        );
    }
    .thumb-placeholder.facebook {
        background: #4267b2;
    }
    .thumb-placeholder.vimeo {
        background: #1ab7ea;
    }
    .thumb-placeholder.html {
        background: #6b7280;
    }

    /* Channel Cards (imported playlists) */
    .channel-card {
        border-color: #ff0000;
        background: linear-gradient(135deg, #1a1a1a 0%, #2d1a1a 100%);
    }
    .channel-card:hover {
        border-color: #ff4444;
        background: linear-gradient(135deg, #2a2a2a 0%, #3d2a2a 100%);
    }
    .channel-badge {
        font-size: 0.75rem;
        color: #ff6b6b;
        margin-top: 8px;
        padding: 4px 10px;
        background: rgba(255, 0, 0, 0.15);
        border-radius: 12px;
    }

    /* YouTube Mode Button */
    .youtube-mode-btn {
        position: fixed;
        top: 20px;
        right: 20px;
        display: flex;
        align-items: center;
        gap: 8px;
        background: #ff0000;
        color: white;
        border: none;
        padding: 12px 20px;
        border-radius: 24px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        z-index: 100;
        box-shadow: 0 4px 12px rgba(255, 0, 0, 0.3);
        transition: all 0.2s;
    }
    .youtube-mode-btn:hover {
        background: #cc0000;
        transform: scale(1.05);
    }
</style>
