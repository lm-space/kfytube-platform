<script lang="ts">
    import { onMount } from "svelte";
    import { API_BASE, categories, getPublicApiHeaders, getTenantSlug, tenantInfo, loadTenantInfo } from "../../lib/stores";
    import UserProfile from "./UserProfile.svelte";

    // View mode
    let allVideos: any[] = [];
    let shortsVideos: any[] = [];
    let regularVideos: any[] = [];
    let filteredVideos: any[] = [];
    let displayedVideos: any[] = [];
    let loading = true;
    let activeTab: "home" | "shorts" | "channels" | "playlists" | "mix" = "home";
    let activeFilter: string | number = 'all';

    // Channels list view
    let channelsList: { id: number, name: string, latestVideo: any, videoCount: number }[] = [];

    // Playlists list view
    let playlistsList: { id: number, name: string, latestVideo: any, videoCount: number }[] = [];

    // Uncategorized videos for Mix tab
    let uncategorizedVideos: any[] = [];
    let mixChannels: { name: string; videos: any[] }[] = [];
    let mixFilterChannel: string | null = null;

    // Channel/Category/Playlist filter from URL
    let channelId: number | null = null;
    let channelName: string = "";
    let channelMap: Map<number, string> = new Map();
    let urlCategoryId: number | null = null;
    let urlCategoryName: string = "";
    let urlPlaylistId: number | null = null;
    let urlPlaylistName: string = "";

    // Pagination
    const VIDEOS_PER_PAGE = 50;
    let currentPage = 1;
    let hasMoreVideos = false;

    // Search
    let searchQuery = "";
    let isSearching = false;
    let mobileSearchExpanded = false;

    // For channel/category display
    let categoryMap: Map<string, string> = new Map();

    // Categories that have videos (for filter chips)
    let categoriesWithVideos: any[] = [];

    // Sidebar state for desktop
    let sidebarOpen = true;
    let isMobile = false;
    let isTablet = false;
    let isTV = false;

    // Shorts horizontal scroll
    let shortsRowElement: HTMLElement;
    let canScrollLeft = false;
    let canScrollRight = true;

    // Tenant info
    let currentTenant: any = null;

    onMount(async () => {
        checkDevice();
        window.addEventListener("resize", checkDevice);

        // Parse URL for channel_id, category_id, playlist_id, or view parameter
        const urlParams = new URLSearchParams(window.location.search);
        const chId = urlParams.get('channel_id');
        const catId = urlParams.get('category_id');
        const plId = urlParams.get('playlist_id');
        const viewParam = urlParams.get('view');
        if (chId) {
            channelId = parseInt(chId);
        }
        if (catId) {
            urlCategoryId = parseInt(catId);
        }
        if (plId) {
            urlPlaylistId = parseInt(plId);
        }
        if (viewParam === 'channels') {
            activeTab = 'channels';
        }
        if (viewParam === 'playlists') {
            activeTab = 'playlists';
        }
        if (viewParam === 'mix') {
            activeTab = 'mix';
        }

        // Load tenant info if on a subdomain
        await loadTenantInfo();
        tenantInfo.subscribe(info => {
            currentTenant = info;
        });

        // Single aggregated fetch - replaces 40+ sequential requests
        const headers = getPublicApiHeaders();
        try {
            // If viewing a specific playlist, we still need a separate fetch for its videos
            let playlistVideos: any[] | null = null;
            if (urlPlaylistId) {
                const plVidRes = await fetch(`${API_BASE}/videos?playlist_id=${urlPlaylistId}`, { headers });
                if (plVidRes.ok) {
                    const plVidData = await plVidRes.json();
                    playlistVideos = Array.isArray(plVidData) ? plVidData : plVidData.items || [];
                }
            }

            // One request for everything: categories, videos, channel playlists, curated playlists
            const homeRes = await fetch(`${API_BASE}/home`, { headers });
            if (!homeRes.ok) throw new Error('Failed to load home data');
            const homeData = await homeRes.json();

            // Process categories
            const cats = homeData.categories || [];
            cats.forEach((c: any) => categoryMap.set(c.id.toString(), c.name));
            categories.set(cats);

            // Process videos - filter to YouTube only
            allVideos = (homeData.videos || []).filter((v: any) =>
                !v.source_type || v.source_type === 'youtube'
            );

            // Build channel map from videos
            const channelVideoCountMap: Map<number, { name: string, latestVideo: any, videoCount: number }> = new Map();
            allVideos.forEach((v: any) => {
                if (v.channel_id && v.channel_name) {
                    if (!channelMap.has(v.channel_id)) {
                        channelMap.set(v.channel_id, v.channel_name);
                    }
                    if (!channelVideoCountMap.has(v.channel_id)) {
                        channelVideoCountMap.set(v.channel_id, {
                            name: v.channel_name, latestVideo: v, videoCount: 1
                        });
                    } else {
                        channelVideoCountMap.get(v.channel_id)!.videoCount++;
                    }
                }
            });

            // Build channels list from pre-fetched channel playlists (preserves admin sort order)
            const chData = homeData.channelPlaylists || [];
            channelsList = chData.map((pl: any) => {
                const channelData = Array.from(channelVideoCountMap.entries()).find(([_, data]) => {
                    return pl.name.includes(data.name) || data.name.includes(pl.name.replace(' - UC', '').split(' - ')[0]);
                });
                return {
                    id: pl.id,
                    name: pl.name.split(' - ')[0],
                    latestVideo: channelData ? channelData[1].latestVideo : null,
                    videoCount: channelData ? channelData[1].videoCount : 0,
                    playlistId: pl.id
                };
            }).filter((ch: any) => ch.videoCount > 0);

            // Set channel/category names for URL-filtered views
            if (channelId && channelMap.has(channelId)) {
                channelName = channelMap.get(channelId) || "";
            }
            if (urlCategoryId && categoryMap.has(urlCategoryId.toString())) {
                urlCategoryName = categoryMap.get(urlCategoryId.toString()) || "";
            }

            // Build playlists list from pre-fetched curated playlists (includes counts)
            const plData = homeData.curatedPlaylists || [];
            playlistsList = plData.map((pl: any) => ({
                id: pl.id,
                name: pl.name,
                latestVideo: pl.latest_youtube_id ? { youtube_id: pl.latest_youtube_id } : null,
                videoCount: pl.video_count || 0
            }));

            // If playlist_id specified, override allVideos with playlist-specific videos
            if (urlPlaylistId && playlistVideos) {
                const playlist = playlistsList.find(p => p.id === urlPlaylistId);
                if (playlist) {
                    urlPlaylistName = playlist.name;
                    playlist.videoCount = playlistVideos.length;
                    if (playlistVideos.length > 0) playlist.latestVideo = playlistVideos[0];
                }
                allVideos = playlistVideos.filter((v: any) => !v.source_type || v.source_type === 'youtube');
            }

            // Separate shorts from regular videos
            // Shorts are identified by is_short flag (1 or true)
            shortsVideos = allVideos.filter((v: any) =>
                v.is_short === 1 ||
                v.is_short === true
            );

            regularVideos = allVideos.filter((v: any) =>
                v.is_short !== 1 &&
                v.is_short !== true
            );

            // If channel_id is specified, filter videos by channel (uncategorized only)
            if (channelId) {
                regularVideos = regularVideos.filter((v: any) =>
                    v.channel_id === channelId && !v.category_id
                );
                shortsVideos = shortsVideos.filter((v: any) =>
                    v.channel_id === channelId && !v.category_id
                );
            }
            // If category_id from URL is specified, filter videos by category
            else if (urlCategoryId) {
                regularVideos = regularVideos.filter((v: any) =>
                    v.category_id === urlCategoryId
                );
                shortsVideos = shortsVideos.filter((v: any) =>
                    v.category_id === urlCategoryId
                );
            }
            // If playlist_id from URL is specified, videos are already filtered from API
            // No additional filtering needed as allVideos was set from playlist API response

            // Compute categories that have videos (for filter chips)
            const categoryIdsWithVideos = new Set<number>();
            regularVideos.forEach((v: any) => {
                if (v.category_id) {
                    categoryIdsWithVideos.add(v.category_id);
                }
            });
            // Filter categories store to only include ones with videos
            categoriesWithVideos = $categories.filter((cat: any) => categoryIdsWithVideos.has(cat.id));

            // Populate uncategorized videos for Mix tab (videos without category_id)
            uncategorizedVideos = allVideos.filter((v: any) =>
                !v.category_id &&
                v.is_short !== 1 &&
                v.is_short !== true
            );

            // Group uncategorized videos by channel for Mix tab
            const channelGroupMap = new Map<string, any[]>();
            uncategorizedVideos.forEach((v: any) => {
                const ch = v.channel_name || 'Unknown Channel';
                if (!channelGroupMap.has(ch)) channelGroupMap.set(ch, []);
                channelGroupMap.get(ch)!.push(v);
            });
            mixChannels = Array.from(channelGroupMap.entries())
                .map(([name, videos]) => ({ name, videos }))
                .sort((a, b) => b.videos.length - a.videos.length);

            // Sort by category order (based on admin-defined category display_order)
            regularVideos = sortByCategoryOrder(regularVideos);
            shortsVideos = sortByCategoryOrder(shortsVideos);
            filteredVideos = regularVideos;
            updateDisplayedVideos();
        } catch (e) {
            console.error("Failed to load videos", e);
        }
        loading = false;

        return () => {
            window.removeEventListener("resize", checkDevice);
        };
    });

    function checkDevice() {
        const w = window.innerWidth;
        isMobile = w < 768;
        isTablet = w >= 768 && w < 1200;
        isTV = w >= 1920;

        // Auto-collapse sidebar on mobile
        if (isMobile) sidebarOpen = false;
        else sidebarOpen = true;
    }

    // Sort videos by category display_order, then by video display_order within category
    function sortByCategoryOrder(arr: any[]) {
        // Build a map of category_id -> category display_order
        const categoryOrderMap = new Map<number, number>();
        $categories.forEach((cat: any, index: number) => {
            // Use category's display_order if available, otherwise use index
            categoryOrderMap.set(cat.id, cat.display_order ?? index);
        });

        return [...arr].sort((a, b) => {
            // First sort by category display_order
            const catOrderA = a.category_id ? (categoryOrderMap.get(a.category_id) ?? 999) : 999;
            const catOrderB = b.category_id ? (categoryOrderMap.get(b.category_id) ?? 999) : 999;

            if (catOrderA !== catOrderB) {
                return catOrderA - catOrderB;
            }

            // Within same category, sort by video display_order
            const vidOrderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
            const vidOrderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
            return vidOrderA - vidOrderB;
        });
    }

    function filterByCategory(categoryId: string | number) {
        activeFilter = categoryId;
        currentPage = 1; // Reset pagination when filtering
        searchQuery = ""; // Clear search when changing category
        isSearching = false;
        if (categoryId === 'all') {
            // Show all videos sorted by category order
            filteredVideos = sortByCategoryOrder(regularVideos);
        } else {
            // Filter by category and sort by display_order from admin
            filteredVideos = regularVideos
                .filter(v => v.category_id == categoryId)
                .sort((a, b) => {
                    // Sort by display_order (ascending) - lower numbers first
                    // Videos without display_order go to the end
                    const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
                    const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
                    return orderA - orderB;
                });
        }
        updateDisplayedVideos();
    }

    function handleSearch() {
        const query = searchQuery.trim().toLowerCase();
        currentPage = 1;

        if (!query) {
            isSearching = false;
            // Reset to current category filter
            if (activeFilter === 'all') {
                filteredVideos = sortByCategoryOrder(regularVideos);
            } else {
                // Sort by display_order from admin
                filteredVideos = regularVideos
                    .filter(v => v.category_id == activeFilter)
                    .sort((a, b) => {
                        const orderA = a.display_order ?? Number.MAX_SAFE_INTEGER;
                        const orderB = b.display_order ?? Number.MAX_SAFE_INTEGER;
                        return orderA - orderB;
                    });
            }
        } else {
            isSearching = true;
            // Search across all videos (regular + shorts)
            filteredVideos = allVideos.filter(v =>
                v.title?.toLowerCase().includes(query) ||
                getCategoryName(v).toLowerCase().includes(query)
            );
        }
        updateDisplayedVideos();
    }

    function clearSearch() {
        searchQuery = "";
        handleSearch();
    }

    function toggleMobileSearch() {
        mobileSearchExpanded = !mobileSearchExpanded;
        if (!mobileSearchExpanded) {
            searchQuery = "";
            handleSearch();
        }
    }

    function closeMobileSearch() {
        mobileSearchExpanded = false;
    }

    function updateDisplayedVideos() {
        const endIndex = currentPage * VIDEOS_PER_PAGE;
        displayedVideos = filteredVideos.slice(0, endIndex);
        hasMoreVideos = endIndex < filteredVideos.length;
    }

    function loadMore() {
        currentPage++;
        updateDisplayedVideos();
    }

    function getCategoryName(video: any): string {
        if (video.category_id && categoryMap.has(video.category_id.toString())) {
            return categoryMap.get(video.category_id.toString()) || "Unknown";
        }
        return video.channel_name || "YouTube";
    }

    function formatDuration(seconds: number | null | undefined): string {
        if (!seconds) return "0:00";
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        if (hours > 0) {
            return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        }
        return `${minutes}:${String(secs).padStart(2, '0')}`;
    }

    function formatViews(count: number | null | undefined): string {
        if (!count) return "No views";
        if (count >= 1000000) return (count / 1000000).toFixed(1) + "M views";
        if (count >= 1000) return Math.floor(count / 1000) + "K views";
        return count + " views";
    }

    function formatTimeAgo(dateString: string | null | undefined): string {
        if (!dateString) return "";
        const date = new Date(dateString);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "1 day ago";
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }

    function openVideo(video: any) {
        window.location.href = `/yt-watch?id=${video.id}`;
    }

    function openShort(video: any) {
        window.location.href = `/yt-shorts?id=${video.id}`;
    }

    function goToCategories() {
        window.location.href = "/categories";
    }

    function goToChannel(chId: number, event: Event) {
        event.stopPropagation(); // Prevent video card click
        window.location.href = `/youtube?channel_id=${chId}`;
    }

    function goHome() {
        window.location.href = "/youtube";
    }

    function goToChannels() {
        window.location.href = "/youtube?view=channels";
    }

    function openChannelView(playlistId: number) {
        window.location.href = `/youtube?playlist_id=${playlistId}`;
    }

    function hardRefresh() {
        // Clear all caches and do a hard refresh
        if (navigator.serviceWorker && navigator.serviceWorker.controller) {
            navigator.serviceWorker.getRegistrations().then(registrations => {
                registrations.forEach(reg => reg.unregister());
            });
        }
        // Clear browser cache by adding timestamp to URL
        window.location.href = window.location.href + (window.location.href.includes('?') ? '&' : '?') + 't=' + Date.now();
    }

    function goToPlaylists() {
        window.location.href = "/youtube?view=playlists";
    }

    function goToMix() {
        window.location.href = "/youtube?view=mix";
    }

    function openPlaylistView(plId: number) {
        window.location.href = `/youtube?playlist_id=${plId}`;
    }

    function toggleSidebar() {
        sidebarOpen = !sidebarOpen;
    }

    // Shorts horizontal scroll functions
    function updateShortsScrollState() {
        if (!shortsRowElement) return;
        canScrollLeft = shortsRowElement.scrollLeft > 0;
        canScrollRight = shortsRowElement.scrollLeft < (shortsRowElement.scrollWidth - shortsRowElement.clientWidth - 10);
    }

    function scrollShortsLeft() {
        if (!shortsRowElement) return;
        const scrollAmount = shortsRowElement.clientWidth * 0.8;
        shortsRowElement.scrollBy({ left: -scrollAmount, behavior: 'smooth' });
    }

    function scrollShortsRight() {
        if (!shortsRowElement) return;
        const scrollAmount = shortsRowElement.clientWidth * 0.8;
        shortsRowElement.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    }
</script>

<svelte:head>
    <title>YouTube</title>
</svelte:head>

<div class="yt-app" class:mobile={isMobile} class:tablet={isTablet} class:tv={isTV} class:search-expanded={mobileSearchExpanded}>
    <!-- Header -->
    <header class="yt-header">
        <div class="header-left">
            <button class="menu-btn" on:click={toggleSidebar} aria-label="Menu">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z"/>
                </svg>
            </button>
            <button class="logo" on:click={goHome} aria-label="Home">
                <svg viewBox="0 0 28 20" width="28" height="20" class="logo-icon">
                    <path fill="#FF0000" d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 2.24288e-07 14.285 0 14.285 0C14.285 0 5.35042 2.24288e-07 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C2.24288e-07 5.35042 0 10 0 10C0 10 2.24288e-07 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z"/>
                    <path fill="white" d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z"/>
                </svg>
                <span class="logo-text">YouTube</span>
            </button>
        </div>

        <!-- Desktop/Tablet Search -->
        <div class="header-center">
            <div class="search-box">
                <input
                    type="text"
                    placeholder="Search"
                    bind:value={searchQuery}
                    on:keydown={(e) => e.key === 'Enter' && handleSearch()}
                />
                {#if searchQuery}
                    <button class="clear-btn" on:click={clearSearch} aria-label="Clear search">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                {/if}
                <button class="search-btn" on:click={handleSearch} aria-label="Search">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                    </svg>
                </button>
            </div>
        </div>

        <div class="header-right">
            <!-- Mobile Search Toggle -->
            <button class="icon-btn mobile-search-toggle" on:click={toggleMobileSearch} aria-label="Search">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
                </svg>
            </button>
            <button class="icon-btn categories-btn" on:click={goToCategories} title="Category View" aria-label="Categories">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
                </svg>
            </button>
            <button class="icon-btn refresh-btn" on:click={hardRefresh} title="Hard Refresh (no cache)" aria-label="Refresh">
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M12 5V1l4 4-4 4V7c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v4l4-4-4-4v3z"/>
                </svg>
            </button>
            <UserProfile />
        </div>
    </header>

    <!-- Mobile Expanded Search Bar -->
    {#if mobileSearchExpanded && isMobile}
        <div class="mobile-search-overlay">
            <div class="mobile-search-bar">
                <button class="back-btn" on:click={toggleMobileSearch} aria-label="Back">
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                    </svg>
                </button>
                <input
                    type="text"
                    placeholder="Search YouTube"
                    bind:value={searchQuery}
                    on:keydown={(e) => { if (e.key === 'Enter') { handleSearch(); closeMobileSearch(); }}}
                    autofocus
                />
                {#if searchQuery}
                    <button class="clear-btn" on:click={clearSearch} aria-label="Clear">
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                {/if}
            </div>
        </div>
    {/if}

    <div class="yt-body">
        <!-- Sidebar -->
        <aside class="yt-sidebar" class:collapsed={!sidebarOpen} class:hidden={channelId !== null || urlCategoryId !== null || urlPlaylistId !== null}>
            <nav class="sidebar-nav">
                <button class="nav-item" class:active={activeTab === "home" && !channelId} on:click={goHome}>
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                    </svg>
                    <span>Home</span>
                </button>
                {#if !channelId}
                    <button class="nav-item" class:active={activeTab === "shorts"} on:click={() => activeTab = "shorts"}>
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33c-.77-.32-1.2-.5-1.2-.5L18 9.06c1.84-.96 2.53-3.23 1.56-5.06s-3.24-2.53-5.07-1.56L6 6.94c-1.29.68-2.07 2.04-2 3.49.07 1.42.93 2.67 2.22 3.25.03.01 1.2.5 1.2.5L6 14.93c-1.83.97-2.53 3.24-1.56 5.07.97 1.83 3.24 2.53 5.07 1.56l8.5-4.5c1.29-.68 2.06-2.04 1.99-3.49-.07-1.42-.94-2.68-2.23-3.25zM10 14.65v-5.3L15 12l-5 2.65z"/>
                        </svg>
                        <span>Shorts</span>
                    </button>
                    <button class="nav-item" class:active={activeTab === "channels"} on:click={goToChannels}>
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                        </svg>
                        <span>Channels</span>
                    </button>
                    <button class="nav-item" class:active={activeTab === "playlists"} on:click={goToPlaylists}>
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/>
                        </svg>
                        <span>Playlists</span>
                    </button>
                    <button class="nav-item" class:active={activeTab === "mix"} on:click={goToMix}>
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/>
                        </svg>
                        <span>Mix</span>
                    </button>
                    <div class="nav-divider"></div>
                    <button class="nav-item" on:click={goToCategories}>
                        <svg viewBox="0 0 24 24" width="24" height="24">
                            <path fill="currentColor" d="M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z"/>
                        </svg>
                        <span>Categories</span>
                    </button>
                {/if}
            </nav>
        </aside>

        <!-- Main Content -->
        <main class="yt-main" class:sidebar-collapsed={!sidebarOpen} class:sidebar-hidden={channelId !== null || urlCategoryId !== null || urlPlaylistId !== null}>
            {#if loading}
                <div class="loading-spinner">
                    <div class="spinner"></div>
                </div>
            {:else}
                {#if channelId}
                    <!-- Channel View Header -->
                    <div class="channel-header">
                        <button class="back-button" on:click={() => window.history.back()} title="Go back">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                            </svg>
                        </button>
                        <div class="channel-header-text">
                            <h2 class="channel-title">{channelName || 'Channel'}</h2>
                            <p class="channel-subtitle">Uncategorized videos from this channel</p>
                        </div>
                    </div>
                {:else if urlCategoryId}
                    <!-- Category View Header -->
                    <div class="channel-header">
                        <button class="back-button" on:click={() => window.history.back()} title="Go back">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                            </svg>
                        </button>
                        <div class="channel-header-text">
                            <h2 class="channel-title">{urlCategoryName || 'Category'}</h2>
                            <p class="channel-subtitle">Videos in this category</p>
                        </div>
                    </div>
                {:else if urlPlaylistId}
                    <!-- Playlist View Header -->
                    <div class="channel-header">
                        <button class="back-button" on:click={() => window.history.back()} title="Go back">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path fill="currentColor" d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
                            </svg>
                        </button>
                        <div class="channel-header-text">
                            <h2 class="channel-title">{urlPlaylistName || 'Playlist'}</h2>
                            <p class="channel-subtitle">Videos in this playlist</p>
                        </div>
                    </div>
                {:else}
                    <!-- Filter chips - Categories with videos only (on home view) -->
                    <div class="filter-chips">
                        <button class="chip" class:active={activeFilter === 'all'} on:click={() => filterByCategory('all')}>All</button>
                        {#each categoriesWithVideos.slice(0, 8) as cat}
                            <button class="chip" class:active={activeFilter === cat.id} on:click={() => filterByCategory(cat.id)}>{cat.name}</button>
                        {/each}
                    </div>
                {/if}

                {#if activeTab === "home"}
                    <!-- Shorts section removed from landing page - accessible via sidebar Shorts button -->

                    <!-- Video Grid -->
                    <section class="videos-section">
                        <div class="video-grid">
                            {#each displayedVideos as video}
                                <button class="video-card" on:click={() => openVideo(video)}>
                                    <div class="thumbnail">
                                        {#if video.source_type === "youtube" || !video.source_type}
                                            <img
                                                src={`https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`}
                                                alt={video.title}
                                                loading="lazy"
                                            />
                                        {:else}
                                            <div class="thumb-placeholder {video.source_type}">
                                                <span>{video.source_type}</span>
                                            </div>
                                        {/if}
                                        <span class="duration">{formatDuration(video.duration)}</span>
                                    </div>
                                    <div class="video-info">
                                        <div class="channel-avatar">
                                            <span>{getCategoryName(video).charAt(0).toUpperCase()}</span>
                                        </div>
                                        <div class="video-meta">
                                            <h3 class="video-title">{video.title}</h3>
                                            {#if video.channel_id}
                                                <a href="/youtube?channel_id={video.channel_id}" class="channel-name channel-link" on:click|stopPropagation>
                                                    {video.channel_name || getCategoryName(video)}
                                                </a>
                                            {:else if video.category_id}
                                                <a href="/youtube?category_id={video.category_id}" class="channel-name channel-link" on:click|stopPropagation>
                                                    {video.category_name || getCategoryName(video)}
                                                </a>
                                            {:else}
                                                <p class="channel-name">{getCategoryName(video)}</p>
                                            {/if}
                                            <p class="video-stats">{formatViews(video.view_count)} • {formatTimeAgo(video.published_at)}</p>
                                        </div>
                                    </div>
                                </button>
                            {/each}
                        </div>

                        <!-- Load More Button -->
                        {#if hasMoreVideos}
                            <div class="load-more-container">
                                <button class="load-more-btn" on:click={loadMore}>
                                    Show more
                                    <svg viewBox="0 0 24 24" width="20" height="20">
                                        <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                                    </svg>
                                </button>
                            </div>
                        {/if}
                    </section>
                {:else if activeTab === "shorts"}
                    <!-- Full Shorts View -->
                    <section class="shorts-full-section">
                        <div class="shorts-grid">
                            {#each shortsVideos as short}
                                <button class="short-card-large" on:click={() => openShort(short)}>
                                    <div class="short-thumb-large">
                                        {#if short.source_type === "youtube" || !short.source_type}
                                            <img
                                                src={`https://img.youtube.com/vi/${short.youtube_id?.split('/').pop() || short.youtube_id}/maxresdefault.jpg`}
                                                alt={short.title}
                                                loading="lazy"
                                            />
                                        {:else}
                                            <div class="short-placeholder">
                                                <span>{short.source_type}</span>
                                            </div>
                                        {/if}
                                        <div class="short-overlay">
                                            <svg viewBox="0 0 24 24" width="48" height="48" class="play-icon">
                                                <path fill="white" d="M8 5v14l11-7z"/>
                                            </svg>
                                        </div>
                                    </div>
                                    <p class="short-title">{short.title}</p>
                                    <p class="short-stats">{formatViews(short.view_count)}</p>
                                </button>
                            {/each}
                        </div>
                    </section>
                {:else if activeTab === "channels"}
                    <!-- Channels List View -->
                    <section class="channels-section">
                        <div class="channels-header">
                            <svg viewBox="0 0 24 24" width="24" height="24" class="channels-icon">
                                <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                            </svg>
                            <h2>Channels</h2>
                        </div>
                        {#if channelsList.length === 0}
                            <div class="no-channels">
                                <p>No channels found</p>
                            </div>
                        {:else}
                            <div class="channels-grid">
                                {#each channelsList as channel}
                                    <button class="channel-card" on:click={() => openChannelView(channel.id)}>
                                        <div class="channel-thumb">
                                            {#if channel.latestVideo && (channel.latestVideo.source_type === "youtube" || !channel.latestVideo.source_type)}
                                                <img
                                                    src={`https://img.youtube.com/vi/${channel.latestVideo.youtube_id}/mqdefault.jpg`}
                                                    alt={channel.name}
                                                    loading="lazy"
                                                />
                                            {:else}
                                                <div class="channel-thumb-placeholder">
                                                    <span>{channel.name.charAt(0).toUpperCase()}</span>
                                                </div>
                                            {/if}
                                            <div class="channel-video-count">
                                                <svg viewBox="0 0 24 24" width="16" height="16">
                                                    <path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/>
                                                </svg>
                                                <span>{channel.videoCount} videos</span>
                                            </div>
                                        </div>
                                        <div class="channel-info">
                                            <div class="channel-avatar-large">
                                                <span>{channel.name.charAt(0).toUpperCase()}</span>
                                            </div>
                                            <div class="channel-details">
                                                <h3 class="channel-card-name">{channel.name}</h3>
                                                <p class="channel-stats">{channel.videoCount} videos</p>
                                            </div>
                                        </div>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </section>
                {:else if activeTab === "playlists"}
                    <!-- Playlists List View -->
                    <section class="channels-section playlists-section">
                        <div class="channels-header">
                            <svg viewBox="0 0 24 24" width="24" height="24" class="channels-icon">
                                <path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/>
                            </svg>
                            <h2>Playlists</h2>
                        </div>
                        {#if playlistsList.length === 0}
                            <div class="no-channels">
                                <p>No playlists found</p>
                            </div>
                        {:else}
                            <div class="channels-grid">
                                {#each playlistsList as playlist}
                                    <button class="channel-card playlist-card" on:click={() => openPlaylistView(playlist.id)}>
                                        <div class="channel-thumb playlist-thumb">
                                            {#if playlist.latestVideo && (playlist.latestVideo.source_type === "youtube" || !playlist.latestVideo.source_type)}
                                                <img
                                                    src={`https://img.youtube.com/vi/${playlist.latestVideo.youtube_id}/mqdefault.jpg`}
                                                    alt={playlist.name}
                                                    loading="lazy"
                                                />
                                            {:else}
                                                <div class="channel-thumb-placeholder playlist-thumb-placeholder">
                                                    <svg viewBox="0 0 24 24" width="48" height="48">
                                                        <path fill="white" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/>
                                                    </svg>
                                                </div>
                                            {/if}
                                            <div class="channel-video-count">
                                                <svg viewBox="0 0 24 24" width="16" height="16">
                                                    <path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/>
                                                </svg>
                                                <span>{playlist.videoCount} videos</span>
                                            </div>
                                        </div>
                                        <div class="channel-info">
                                            <div class="channel-avatar-large playlist-avatar">
                                                <svg viewBox="0 0 24 24" width="20" height="20">
                                                    <path fill="white" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/>
                                                </svg>
                                            </div>
                                            <div class="channel-details">
                                                <h3 class="channel-card-name">{playlist.name}</h3>
                                                <p class="channel-stats">{playlist.videoCount} videos</p>
                                            </div>
                                        </div>
                                    </button>
                                {/each}
                            </div>
                        {/if}
                    </section>
                {:else if activeTab === "mix"}
                    <!-- Mix View - Grouped by Channel -->
                    <section class="mix-section">
                        <div class="channels-header">
                            <svg viewBox="0 0 24 24" width="24" height="24" class="channels-icon">
                                <path fill="currentColor" d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/>
                            </svg>
                            <h2>{mixFilterChannel || 'Mix'}</h2>
                            {#if mixFilterChannel}
                                <button class="mix-back-btn" on:click={() => mixFilterChannel = null}>
                                    Show all channels
                                </button>
                            {:else}
                                <span class="mix-subtitle">{mixChannels.length} channels</span>
                            {/if}
                        </div>
                        {#if mixChannels.length === 0}
                            <div class="no-channels">
                                <p>No uncategorized videos found</p>
                            </div>
                        {:else if mixFilterChannel}
                            <!-- Filtered: show videos for selected channel -->
                            {@const channelVids = mixChannels.find(c => c.name === mixFilterChannel)?.videos || []}
                            <div class="video-grid">
                                {#each channelVids as video}
                                    <button class="video-card" on:click={() => openVideo(video)}>
                                        <div class="thumbnail">
                                            {#if video.source_type === "youtube" || !video.source_type}
                                                <img src={`https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`} alt={video.title} loading="lazy" />
                                            {:else}
                                                <div class="thumb-placeholder {video.source_type}"><span>{video.source_type}</span></div>
                                            {/if}
                                            <span class="duration">{formatDuration(video.duration)}</span>
                                        </div>
                                        <div class="video-info">
                                            <div class="channel-avatar mix-avatar">
                                                <span>{(video.channel_name || 'Y').charAt(0).toUpperCase()}</span>
                                            </div>
                                            <div class="video-meta">
                                                <h3 class="video-title">{video.title}</h3>
                                                <p class="video-stats">{formatViews(video.view_count)} • {formatTimeAgo(video.published_at)}</p>
                                            </div>
                                        </div>
                                    </button>
                                {/each}
                            </div>
                        {:else}
                            <!-- Channel list with previews -->
                            <div class="mix-channel-list">
                                {#each mixChannels as ch}
                                    <div class="mix-channel-group">
                                        <button class="mix-channel-header" on:click={() => mixFilterChannel = ch.name}>
                                            <div class="channel-avatar mix-avatar">
                                                <span>{ch.name.charAt(0).toUpperCase()}</span>
                                            </div>
                                            <span class="mix-channel-name">{ch.name}</span>
                                            <span class="mix-channel-count">{ch.videos.length} videos</span>
                                            <span class="mix-channel-arrow">›</span>
                                        </button>
                                        <div class="mix-channel-preview">
                                            {#each ch.videos.slice(0, 6) as video}
                                                <button class="video-card" on:click={() => openVideo(video)}>
                                                    <div class="thumbnail">
                                                        {#if video.source_type === "youtube" || !video.source_type}
                                                            <img src={`https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`} alt={video.title} loading="lazy" />
                                                        {:else}
                                                            <div class="thumb-placeholder {video.source_type}"><span>{video.source_type}</span></div>
                                                        {/if}
                                                        <span class="duration">{formatDuration(video.duration)}</span>
                                                    </div>
                                                    <div class="video-info">
                                                        <div class="video-meta">
                                                            <h3 class="video-title">{video.title}</h3>
                                                            <p class="video-stats">{formatViews(video.view_count)} • {formatTimeAgo(video.published_at)}</p>
                                                        </div>
                                                    </div>
                                                </button>
                                            {/each}
                                        </div>
                                        {#if ch.videos.length > 6}
                                            <button class="mix-see-all" on:click={() => mixFilterChannel = ch.name}>
                                                See all {ch.videos.length} videos ›
                                            </button>
                                        {/if}
                                    </div>
                                {/each}
                            </div>
                        {/if}
                    </section>
                {/if}
            {/if}
        </main>
    </div>

    <!-- Mobile Bottom Nav -->
    {#if isMobile}
        <nav class="mobile-nav">
            <button class="mobile-nav-item" class:active={activeTab === "home" && !channelId} on:click={goHome}>
                <svg viewBox="0 0 24 24" width="24" height="24">
                    <path fill="currentColor" d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
                </svg>
                <span>Home</span>
            </button>
            {#if !channelId}
                <button class="mobile-nav-item" class:active={activeTab === "shorts"} on:click={() => activeTab = "shorts"}>
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M10 14.65v-5.3L15 12l-5 2.65zm7.77-4.33c-.77-.32-1.2-.5-1.2-.5L18 9.06c1.84-.96 2.53-3.23 1.56-5.06s-3.24-2.53-5.07-1.56L6 6.94c-1.29.68-2.07 2.04-2 3.49.07 1.42.93 2.67 2.22 3.25.03.01 1.2.5 1.2.5L6 14.93c-1.83.97-2.53 3.24-1.56 5.07.97 1.83 3.24 2.53 5.07 1.56l8.5-4.5c1.29-.68 2.06-2.04 1.99-3.49-.07-1.42-.94-2.68-2.23-3.25z"/>
                    </svg>
                    <span>Shorts</span>
                </button>
                <button class="mobile-nav-item" class:active={activeTab === "channels"} on:click={goToChannels}>
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3zm0 14.2c-2.5 0-4.71-1.28-6-3.22.03-1.99 4-3.08 6-3.08 1.99 0 5.97 1.09 6 3.08-1.29 1.94-3.5 3.22-6 3.22z"/>
                    </svg>
                    <span>Channels</span>
                </button>
                <button class="mobile-nav-item" class:active={activeTab === "playlists"} on:click={goToPlaylists}>
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8 12.5v-9l6 4.5-6 4.5z"/>
                    </svg>
                    <span>Playlists</span>
                </button>
                <button class="mobile-nav-item" class:active={activeTab === "mix"} on:click={goToMix}>
                    <svg viewBox="0 0 24 24" width="24" height="24">
                        <path fill="currentColor" d="M4 10h12v2H4zm0-4h12v2H4zm0 8h8v2H4zm10 0v6l5-3z"/>
                    </svg>
                    <span>Mix</span>
                </button>
            {/if}
        </nav>
    {/if}

    <!-- POC Disclaimer Footer -->
    <footer class="poc-footer">
        <div class="poc-disclaimer">
            <p>
                <strong>Proof of Concept (POC) Application</strong>
            </p>
            <p>
                This is a personal demonstration project. All videos are embedded from YouTube.
                For the best experience and to support content creators, please visit
                <a href="https://www.youtube.com" target="_blank" rel="noopener noreferrer">YouTube.com</a>
                directly.
            </p>
            <p class="copyright">
                &copy; {new Date().getFullYear()} KFY Tube POC. Not affiliated with YouTube or Google.
            </p>
        </div>
    </footer>
</div>

<style>
    /* YouTube Dark Theme */
    .yt-app {
        --yt-bg: #0f0f0f;
        --yt-bg-secondary: #272727;
        --yt-bg-hover: #3f3f3f;
        --yt-text: #f1f1f1;
        --yt-text-secondary: #aaa;
        --yt-red: #ff0000;
        --yt-header-height: 56px;
        --yt-sidebar-width: 240px;
        --yt-sidebar-collapsed: 72px;

        background: var(--yt-bg);
        color: var(--yt-text);
        min-height: 100vh;
        font-family: 'Roboto', 'Arial', sans-serif;
        overflow-x: hidden;
        box-sizing: border-box;
        width: 100%;
        max-width: 100vw;
    }

    .yt-app *, .yt-app *::before, .yt-app *::after {
        box-sizing: border-box;
    }

    /* Header */
    .yt-header {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: var(--yt-header-height);
        background: var(--yt-bg);
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        z-index: 1000;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .header-left {
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .menu-btn, .icon-btn {
        background: none;
        border: none;
        color: var(--yt-text);
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .menu-btn:hover, .icon-btn:hover {
        background: var(--yt-bg-hover);
    }

    .logo {
        display: flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
        background: none;
        border: none;
        padding: 0;
    }

    .logo-text {
        font-size: 18px;
        font-weight: 700;
        letter-spacing: -1px;
        color: var(--yt-text);
    }

    /* Hide mobile search toggle on desktop */
    .mobile-search-toggle {
        display: none;
    }

    .header-center {
        flex: 1;
        max-width: 640px;
        margin: 0 40px;
    }

    .search-box {
        display: flex;
        width: 100%;
    }

    .search-box input {
        flex: 1;
        background: var(--yt-bg);
        border: 1px solid #303030;
        border-right: none;
        border-radius: 40px 0 0 40px;
        padding: 10px 16px;
        color: var(--yt-text);
        font-size: 16px;
        outline: none;
    }

    .search-box input:focus {
        border-color: #1c62b9;
    }

    .search-btn {
        background: var(--yt-bg-secondary);
        border: 1px solid #303030;
        border-radius: 0 40px 40px 0;
        padding: 0 24px;
        color: var(--yt-text);
        cursor: pointer;
    }

    .clear-btn {
        background: transparent;
        border: none;
        color: var(--yt-text-secondary);
        cursor: pointer;
        padding: 0 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        margin-right: -8px;
    }

    .clear-btn:hover {
        color: var(--yt-text);
    }

    .header-right {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: none;
        border: none;
        padding: 0;
        cursor: pointer;
        overflow: hidden;
    }

    .avatar-img {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        object-fit: cover;
    }

    /* Mobile Search Overlay */
    .mobile-search-overlay {
        display: none;
    }

    /* Body Layout */
    .yt-body {
        display: flex;
        padding-top: var(--yt-header-height);
    }

    /* Sidebar */
    .yt-sidebar {
        position: fixed;
        top: var(--yt-header-height);
        left: 0;
        bottom: 0;
        width: var(--yt-sidebar-width);
        background: var(--yt-bg);
        overflow-y: auto;
        transition: width 0.2s ease, transform 0.2s ease;
        z-index: 100;
    }

    .yt-sidebar.collapsed {
        width: var(--yt-sidebar-collapsed);
    }

    .yt-sidebar.collapsed .nav-item span {
        display: none;
    }

    .yt-sidebar.collapsed .nav-item {
        flex-direction: column;
        padding: 16px 0;
        font-size: 10px;
    }

    .sidebar-nav {
        padding: 12px 0;
    }

    .nav-item {
        display: flex;
        align-items: center;
        gap: 24px;
        width: 100%;
        padding: 10px 12px 10px 24px;
        background: none;
        border: none;
        color: var(--yt-text);
        font-size: 14px;
        cursor: pointer;
        text-align: left;
        border-radius: 10px;
        margin: 0 12px;
        width: calc(100% - 24px);
    }

    .nav-item:hover {
        background: var(--yt-bg-secondary);
    }

    .nav-item.active {
        background: var(--yt-bg-secondary);
        font-weight: 500;
    }

    .nav-divider {
        height: 1px;
        background: rgba(255,255,255,0.1);
        margin: 12px 0;
    }

    /* Main Content */
    .yt-main {
        flex: 1;
        margin-left: var(--yt-sidebar-width);
        padding: 16px 24px;
        transition: margin-left 0.2s ease;
        min-height: calc(100vh - var(--yt-header-height));
    }

    .yt-main.sidebar-collapsed {
        margin-left: var(--yt-sidebar-collapsed);
    }

    .yt-main.sidebar-hidden {
        margin-left: 0;
    }

    /* Filter Chips */
    .filter-chips {
        display: flex;
        gap: 12px;
        overflow-x: auto;
        padding-bottom: 12px;
        margin-bottom: 24px;
        scrollbar-width: none;
    }

    .filter-chips::-webkit-scrollbar {
        display: none;
    }

    .chip {
        background: var(--yt-bg-secondary);
        border: none;
        color: var(--yt-text);
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 14px;
        cursor: pointer;
        white-space: nowrap;
    }

    .chip:hover {
        background: var(--yt-bg-hover);
    }

    .chip.active {
        background: var(--yt-text);
        color: var(--yt-bg);
    }

    /* Shorts Section */
    .shorts-section {
        margin-bottom: 32px;
    }

    .section-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
    }

    .section-header h2 {
        font-size: 20px;
        font-weight: 500;
        margin: 0;
    }

    .shorts-row-container {
        position: relative;
    }

    .shorts-row {
        display: flex;
        gap: 16px;
        overflow-x: auto;
        padding-bottom: 16px;
        scrollbar-width: none;
        scroll-behavior: smooth;
    }

    .shorts-row::-webkit-scrollbar {
        display: none;
    }

    .shorts-nav-btn {
        position: absolute;
        top: 50%;
        transform: translateY(-70%);
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--yt-bg-secondary);
        border: none;
        color: var(--yt-text);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
        transition: background 0.2s, transform 0.2s;
    }

    .shorts-nav-btn:hover {
        background: var(--yt-bg-hover);
        transform: translateY(-70%) scale(1.1);
    }

    .shorts-nav-left {
        left: -8px;
    }

    .shorts-nav-right {
        right: -8px;
    }

    .short-card {
        flex: 0 0 auto;
        width: 180px;
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        color: var(--yt-text);
    }

    .short-thumb {
        width: 100%;
        aspect-ratio: 9/16;
        border-radius: 12px;
        overflow: hidden;
        position: relative;
        background: #272727;
    }

    .short-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .short-overlay {
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        padding: 8px;
        background: linear-gradient(transparent, rgba(0,0,0,0.8));
    }

    .short-views {
        font-size: 12px;
        font-weight: 500;
    }

    .short-title {
        font-size: 14px;
        margin: 8px 0 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.4;
    }

    /* Video Grid */
    .video-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 16px 16px;
    }

    /* Load More Button */
    .load-more-container {
        display: flex;
        justify-content: center;
        margin: 32px 0;
    }

    .load-more-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background: transparent;
        border: 1px solid var(--yt-bg-hover);
        color: var(--yt-text);
        padding: 10px 24px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.2s;
    }

    .load-more-btn:hover {
        background: var(--yt-bg-secondary);
    }

    .video-card {
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        color: var(--yt-text);
    }

    .thumbnail {
        width: 100%;
        aspect-ratio: 16/9;
        border-radius: 12px;
        overflow: hidden;
        position: relative;
        background: #272727;
    }

    .thumbnail img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .duration {
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
    }

    .video-info {
        display: flex;
        gap: 12px;
        padding: 12px 0;
    }

    .channel-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: var(--yt-bg-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
        font-size: 14px;
        font-weight: 500;
    }

    .video-meta {
        flex: 1;
        min-width: 0;
    }

    .video-title {
        font-size: 14px;
        font-weight: 500;
        margin: 0 0 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.4;
    }

    .channel-name {
        font-size: 12px;
        color: var(--yt-text-secondary);
        margin: 0 0 2px;
    }

    a.channel-name.channel-link {
        text-decoration: none;
        cursor: pointer;
    }

    a.channel-name.channel-link:hover {
        color: var(--yt-text);
    }

    /* Channel View Header */
    .channel-header {
        margin-bottom: 24px;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        display: flex;
        align-items: center;
        gap: 16px;
    }

    .back-button {
        background: none;
        border: none;
        color: var(--yt-text);
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        flex-shrink: 0;
    }

    .back-button:hover {
        background: var(--yt-bg-hover);
    }

    .channel-header-text {
        flex: 1;
    }

    .channel-title {
        font-size: 24px;
        font-weight: 500;
        margin: 0 0 4px;
    }

    .channel-subtitle {
        font-size: 14px;
        color: var(--yt-text-secondary);
        margin: 0;
    }

    /* Hide sidebar in channel view */
    .yt-sidebar.hidden {
        display: none;
    }

    .video-stats {
        font-size: 12px;
        color: var(--yt-text-secondary);
        margin: 0;
    }

    /* Shorts Full View */
    .shorts-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
    }

    .short-card-large {
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        color: var(--yt-text);
    }

    .short-thumb-large {
        width: 100%;
        aspect-ratio: 9/16;
        border-radius: 12px;
        overflow: hidden;
        position: relative;
        background: #272727;
    }

    .short-thumb-large img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .short-thumb-large .short-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(0,0,0,0.3);
        opacity: 0;
        transition: opacity 0.2s;
    }

    .short-card-large:hover .short-overlay {
        opacity: 1;
    }

    .short-stats {
        font-size: 12px;
        color: var(--yt-text-secondary);
        margin: 4px 0 0;
    }

    /* Loading */
    .loading-spinner {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 200px;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid var(--yt-bg-secondary);
        border-top-color: var(--yt-red);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    /* Mobile Bottom Nav */
    .mobile-nav {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 56px;
        background: var(--yt-bg);
        display: flex;
        justify-content: space-around;
        align-items: center;
        border-top: 1px solid rgba(255,255,255,0.1);
        z-index: 1000;
    }

    .mobile-nav-item {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        background: none;
        border: none;
        color: var(--yt-text-secondary);
        font-size: 10px;
        cursor: pointer;
        padding: 8px 16px;
    }

    .mobile-nav-item.active {
        color: var(--yt-text);
    }

    /* Placeholder styles */
    .thumb-placeholder, .short-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        text-transform: uppercase;
        background: #444;
    }

    .thumb-placeholder.twitter { background: #1da1f2; }
    .thumb-placeholder.tiktok { background: #000; }
    .thumb-placeholder.instagram { background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); }
    .thumb-placeholder.facebook { background: #4267b2; }
    .thumb-placeholder.vimeo { background: #1ab7ea; }

    /* RESPONSIVE: Mobile */
    .yt-app.mobile .yt-sidebar {
        transform: translateX(-100%);
        width: var(--yt-sidebar-width);
    }

    .yt-app.mobile .yt-sidebar:not(.collapsed) {
        transform: translateX(0);
    }

    .yt-app.mobile .yt-main {
        margin-left: 0;
        padding: 12px;
        padding-bottom: 72px;
        width: 100%;
        max-width: 100%;
    }

    .yt-app.mobile .yt-header {
        height: var(--yt-header-height);
        padding: 0 8px;
    }

    .yt-app.mobile .header-left {
        gap: 8px;
    }

    /* Hide logo text on mobile - show only red icon */
    .yt-app.mobile .logo-text {
        display: none;
    }

    /* Hide desktop search on mobile */
    .yt-app.mobile .header-center {
        display: none;
    }

    /* Show mobile search toggle */
    .yt-app.mobile .mobile-search-toggle {
        display: flex;
    }

    /* Mobile Search Overlay */
    .yt-app.mobile .mobile-search-overlay {
        display: flex;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: var(--yt-header-height);
        background: var(--yt-bg);
        z-index: 1001;
        align-items: center;
        padding: 0 8px;
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .mobile-search-bar {
        display: flex;
        align-items: center;
        flex: 1;
        gap: 8px;
    }

    .mobile-search-bar .back-btn {
        background: none;
        border: none;
        color: var(--yt-text);
        padding: 8px;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .mobile-search-bar input {
        flex: 1;
        background: transparent;
        border: none;
        color: var(--yt-text);
        font-size: 16px;
        outline: none;
        padding: 8px 0;
    }

    .mobile-search-bar input::placeholder {
        color: var(--yt-text-secondary);
    }

    .mobile-search-bar .clear-btn {
        padding: 8px;
    }

    .yt-app.mobile .search-btn {
        padding: 0 16px;
    }

    .yt-app.mobile .video-grid {
        grid-template-columns: 1fr;
        gap: 16px;
    }

    .yt-app.mobile .video-card {
        width: 100%;
    }

    .yt-app.mobile .thumbnail {
        width: 100%;
    }

    .yt-app.mobile .video-info {
        width: 100%;
    }

    .yt-app.mobile .video-meta {
        min-width: 0;
        overflow: hidden;
    }

    .yt-app.mobile .video-title {
        word-wrap: break-word;
        overflow-wrap: break-word;
    }

    .yt-app.mobile .filter-chips {
        margin: 0 -12px 16px;
        padding: 0 12px 12px;
    }

    .yt-app.mobile .short-card {
        width: 140px;
    }

    .yt-app.mobile .shorts-row {
        margin: 0 -12px;
        padding: 0 12px 16px;
    }

    /* Hide nav arrows on mobile - rely on touch scroll */
    .yt-app.mobile .shorts-nav-btn {
        display: none;
    }

    .yt-app.mobile .shorts-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 12px;
    }

    .yt-app.mobile .short-card-large {
        width: 100%;
    }

    /* RESPONSIVE: Tablet/iPad */
    /* Hide logo text on tablet - show only red icon */
    .yt-app.tablet .logo-text {
        display: none;
    }

    .yt-app.tablet .header-center {
        flex: 1;
        max-width: 480px;
        margin: 0 24px;
    }

    .yt-app.tablet .yt-sidebar {
        width: var(--yt-sidebar-collapsed);
    }

    .yt-app.tablet .yt-sidebar .nav-item span {
        display: none;
    }

    .yt-app.tablet .yt-sidebar .nav-item {
        flex-direction: column;
        padding: 16px 0;
        font-size: 10px;
        gap: 6px;
    }

    .yt-app.tablet .yt-main {
        margin-left: var(--yt-sidebar-collapsed);
        padding: 16px;
        width: calc(100% - var(--yt-sidebar-collapsed));
        max-width: calc(100vw - var(--yt-sidebar-collapsed));
    }

    .yt-app.tablet .video-grid {
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
    }

    .yt-app.tablet .video-title {
        word-wrap: break-word;
        overflow-wrap: break-word;
    }

    .yt-app.tablet .short-card {
        width: 160px;
    }

    .yt-app.tablet .shorts-grid {
        grid-template-columns: repeat(3, 1fr);
    }

    /* RESPONSIVE: TV / Wide Screen */
    .yt-app.tv {
        --yt-sidebar-width: 280px;
    }

    .yt-app.tv .video-grid {
        grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
        gap: 24px;
    }

    .yt-app.tv .video-title {
        font-size: 16px;
    }

    .yt-app.tv .channel-name,
    .yt-app.tv .video-stats {
        font-size: 14px;
    }

    .yt-app.tv .short-card {
        width: 220px;
    }

    .yt-app.tv .shorts-grid {
        grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    }

    .yt-app.tv .filter-chips {
        gap: 16px;
    }

    .yt-app.tv .chip {
        padding: 10px 16px;
        font-size: 16px;
    }

    /* POC Disclaimer Footer */
    .poc-footer {
        background: #181818;
        border-top: 1px solid rgba(255,255,255,0.1);
        padding: 24px 16px;
        margin-left: var(--yt-sidebar-collapsed);
        transition: margin-left 0.2s ease;
    }

    .poc-disclaimer {
        max-width: 800px;
        margin: 0 auto;
        text-align: center;
        color: var(--yt-text-secondary);
        font-size: 13px;
        line-height: 1.6;
    }

    .poc-disclaimer p {
        margin: 8px 0;
    }

    .poc-disclaimer strong {
        color: var(--yt-text);
        font-size: 14px;
    }

    .poc-disclaimer a {
        color: #3ea6ff;
        text-decoration: none;
    }

    .poc-disclaimer a:hover {
        text-decoration: underline;
    }

    .poc-disclaimer .copyright {
        margin-top: 16px;
        font-size: 11px;
        color: #666;
    }

    .yt-app.mobile .poc-footer {
        margin-left: 0;
        padding-bottom: 80px; /* Space for mobile nav */
    }

    .yt-app.tablet .poc-footer {
        margin-left: var(--yt-sidebar-collapsed);
    }

    /* Channels Section */
    .channels-section {
        padding: 16px 0;
    }

    .channels-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 24px;
        padding: 0 16px;
    }

    .channels-header h2 {
        font-size: 20px;
        font-weight: 500;
        margin: 0;
    }

    .channels-icon {
        color: var(--yt-text);
    }

    .no-channels {
        text-align: center;
        padding: 48px 16px;
        color: var(--yt-text-secondary);
    }

    .channels-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 24px;
        padding: 0 16px;
    }

    .channel-card {
        background: none;
        border: none;
        cursor: pointer;
        text-align: left;
        padding: 0;
        border-radius: 12px;
        overflow: hidden;
        transition: transform 0.2s;
    }

    .channel-card:hover {
        transform: translateY(-4px);
    }

    .channel-thumb {
        position: relative;
        aspect-ratio: 16 / 9;
        border-radius: 12px;
        overflow: hidden;
        background: var(--yt-bg-secondary);
    }

    .channel-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .channel-thumb-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: linear-gradient(135deg, #ff0000, #cc0000);
        font-size: 48px;
        font-weight: 700;
        color: white;
    }

    .channel-video-count {
        position: absolute;
        bottom: 8px;
        right: 8px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 4px 8px;
        border-radius: 4px;
        font-size: 12px;
        display: flex;
        align-items: center;
        gap: 4px;
    }

    .channel-info {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 0;
    }

    .channel-avatar-large {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: linear-gradient(135deg, #ff0000, #cc0000);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 16px;
        color: white;
        flex-shrink: 0;
    }

    .channel-details {
        flex: 1;
        min-width: 0;
    }

    .channel-card-name {
        font-size: 14px;
        font-weight: 500;
        color: var(--yt-text);
        margin: 0 0 4px 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .channel-stats {
        font-size: 12px;
        color: var(--yt-text-secondary);
        margin: 0;
    }

    /* Mobile responsive for channels */
    @media (max-width: 768px) {
        .channels-grid {
            grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
            gap: 16px;
            padding: 0 8px;
        }

        .channel-avatar-large {
            width: 32px;
            height: 32px;
            font-size: 14px;
        }

        .channel-card-name {
            font-size: 13px;
        }

        .channels-header {
            padding: 0 8px;
        }
    }

    /* Playlists Section - inherits from channels styles with accent color override */
    .playlist-thumb-placeholder {
        background: linear-gradient(135deg, #673ab7, #512da8);
    }

    .playlist-avatar {
        background: linear-gradient(135deg, #673ab7, #512da8);
    }

    /* Mix Section */
    .mix-section {
        padding: 16px 0;
    }

    .mix-section .channels-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 24px;
        padding: 0 16px;
        flex-wrap: wrap;
    }

    .mix-subtitle {
        font-size: 14px;
        color: var(--yt-text-secondary);
        margin-left: 8px;
    }

    .mix-back-btn {
        background: var(--yt-bg-secondary);
        color: var(--yt-text);
        border: none;
        padding: 6px 14px;
        border-radius: 18px;
        font-size: 13px;
        cursor: pointer;
        margin-left: auto;
    }
    .mix-back-btn:hover {
        background: var(--yt-bg-hover);
    }

    .mix-section .video-grid {
        padding: 0 16px;
    }

    .mix-avatar {
        background: linear-gradient(135deg, #00bcd4, #00838f);
    }

    .mix-channel-list {
        display: flex;
        flex-direction: column;
        gap: 32px;
        padding: 0 16px;
    }

    .mix-channel-group {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .mix-channel-header {
        display: flex;
        align-items: center;
        gap: 12px;
        background: none;
        border: none;
        padding: 8px 12px;
        border-radius: 10px;
        cursor: pointer;
        color: var(--yt-text);
        transition: background 0.15s;
    }
    .mix-channel-header:hover {
        background: var(--yt-bg-secondary);
    }

    .mix-channel-name {
        font-size: 16px;
        font-weight: 600;
        flex: 1;
        text-align: left;
    }

    .mix-channel-count {
        font-size: 13px;
        color: var(--yt-text-secondary);
    }

    .mix-channel-arrow {
        font-size: 20px;
        color: var(--yt-text-secondary);
    }

    .mix-channel-preview {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 12px;
    }

    .mix-see-all {
        background: none;
        border: 1px solid var(--yt-bg-hover);
        color: #3ea6ff;
        padding: 8px 16px;
        border-radius: 18px;
        font-size: 13px;
        cursor: pointer;
        align-self: flex-start;
        margin-top: 4px;
    }
    .mix-see-all:hover {
        background: rgba(62, 166, 255, 0.1);
    }

    @media (max-width: 768px) {
        .mix-section .video-grid {
            padding: 0 8px;
        }

        .mix-section .channels-header {
            padding: 0 8px;
        }

        .mix-subtitle {
            flex-basis: 100%;
            margin-left: 32px;
            margin-top: -4px;
        }

        .mix-channel-list {
            padding: 0 8px;
        }

        .mix-channel-preview {
            grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
            gap: 8px;
        }
    }
</style>
