<script lang="ts">
    import { onMount } from "svelte";
    import { API_BASE, categories, getPublicApiHeaders } from "../../lib/stores";
    import Comments from "./Comments.svelte";

    let video: any = null;
    let recommendations: any[] = [];
    let allFilteredVideos: any[] = []; // Store all filtered videos for lazy loading
    let channelVideos: any[] = []; // Videos from the same channel
    let otherVideos: any[] = []; // Videos from other channels
    let loading = true;
    let categoryMap: Map<string, string> = new Map();

    // Device detection
    let isMobile = false;
    let isTablet = false;
    let isTV = false;

    // Expanded description
    let descExpanded = false;

    // Recommendation tabs
    let activeRecTab: string = 'channel';
    let featuredCats: { id: number; name: string; videos: any[]; repeat_enabled?: boolean }[] = [];
    let featuredPlaylists: { id: number; name: string; videos: any[]; loading: boolean; repeat_enabled?: boolean }[] = [];

    // Track current context for repeat functionality
    let currentCategoryId: number | null = null;
    let currentCategoryRepeat: boolean = false;
    let currentPlaylistId: number | null = null;
    let currentPlaylistRepeat: boolean = false;

    // Infinite scroll for recommendations
    const INITIAL_LOAD = 10;
    const LOAD_MORE_COUNT = 10;
    const MAX_RECOMMENDATIONS = 150;
    let displayedCount = INITIAL_LOAD;
    let loadingMore = false;
    let recListElement: HTMLElement;

    // Double-tap/click fullscreen
    let playerWrapper: HTMLElement;
    let lastClickTime = 0;
    const DOUBLE_CLICK_DELAY = 300;

    // Auto-play next video
    let videoEnded = false;
    let autoPlayCountdown = 5;
    let autoPlayTimer: ReturnType<typeof setInterval> | null = null;
    let autoPlayCancelled = false;
    let autoPlayEnabled = true;

    // Repeat mode tracking - track ALL videos and which have been played
    let repeatModeAllVideos: Map<string, any[]> = new Map(); // key: "cat_ID" or "pl_ID", value: all videos
    let repeatModePlayedVideos: Set<number> = new Set(); // video IDs that have been played in current repeat session

    // Repeat mode modal and tracking
    let showRepeatModal = false;
    let repeatCurrentIndex = 0; // Current video position in the repeat list
    let repeatTotalVideos = 0; // Total videos in repeat list
    let repeatVideosList: any[] = []; // All videos in repeat list for modal

    // YouTube IFrame Player API
    let ytPlayer: any = null;

    // Collapsible info section (description + comments) - always collapsed by default
    let infoCollapsed = true;

    onMount(async () => {
        console.warn('%c=== REPEAT MODE DEBUG START ===', 'background: #ff6b6b; color: white; font-size: 14px; font-weight: bold; padding: 5px;');
        console.warn('YouTubeWatchPage mounted');
        checkDevice();
        window.addEventListener("resize", checkDevice);
        window.addEventListener("scroll", handleWindowScroll);

        const params = new URLSearchParams(window.location.search);
        const videoId = params.get("id");
        console.warn('Video ID:', videoId);

        if (!videoId) {
            window.location.href = "/youtube";
            return;
        }

        const headers = getPublicApiHeaders();

        try {
            // Fetch video details + all videos from cached /api/home in parallel
            const [vidRes, homeRes] = await Promise.all([
                fetch(`${API_BASE}/videos/${videoId}`, { headers }),
                fetch(`${API_BASE}/home`, { headers }),
            ]);

            if (vidRes.ok) {
                video = await vidRes.json();
            }

            let allFetchedVideos: any[] = [];
            let homeData: any = null;
            if (homeRes.ok) {
                homeData = await homeRes.json();
                const cats = homeData.categories || [];
                cats.forEach((c: any) => categoryMap.set(c.id.toString(), c.name));
                categories.set(cats);
                allFetchedVideos = homeData.videos || [];
                const inbaVideos = allFetchedVideos.filter((v: any) => v.category_id === 24).length;
                console.warn('%cHOME DATA LOADED', 'background: #4ecdc4; color: white; padding: 5px; font-weight: bold;', {
                    categories: cats.length,
                    totalVideos: allFetchedVideos.length,
                    videosInInba: inbaVideos
                });
            }

            if (allFetchedVideos.length > 0) {
                // Filter out current video and shorts FOR RECOMMENDATIONS
                const filtered = allFetchedVideos.filter((v: any) =>
                    v.id != videoId &&
                    !v.youtube_id?.includes('/shorts/') &&
                    !v.url?.includes('/shorts/') &&
                    v.is_short !== true
                );

                // For REPEAT MODE: Include current video, just filter out shorts
                const allVideosForRepeat = allFetchedVideos.filter((v: any) =>
                    !v.youtube_id?.includes('/shorts/') &&
                    !v.url?.includes('/shorts/') &&
                    v.is_short !== true
                );

                // Separate videos into channel videos and other videos
                if (video?.channel_id) {
                    channelVideos = shuffleArray(filtered.filter((v: any) => v.channel_id === video.channel_id));
                    otherVideos = shuffleArray(filtered.filter((v: any) => v.channel_id !== video.channel_id));
                } else {
                    // No channel_id, put all in other videos
                    channelVideos = [];
                    otherVideos = shuffleArray(filtered);
                }

                // Build featured category video lists from already-loaded data
                const allCats = homeData?.categories || [];
                const featuredIds = new Set(allCats.filter((c: any) => c.is_featured).map((c: any) => c.id));

                featuredCats = allCats
                    .filter((c: any) => c.is_featured)
                    .map((c: any) => {
                        // For display: filter out current video
                        const displayCatVideos = filtered.filter((v: any) => v.category_id === c.id);
                        // For repeat mode: include current video
                        const allCatVideos = allVideosForRepeat.filter((v: any) => v.category_id === c.id);
                        // Store ALL videos (including current) for repeat mode, but display only first 10 in sidebar
                        const displayVideos = displayCatVideos.slice(0, 10);
                        const result = { id: c.id, name: c.name, videos: displayVideos, repeat_enabled: c.repeat_enabled };
                        // If repeat enabled, store all videos for looping (including current video)
                        if (c.repeat_enabled) {
                            repeatModeAllVideos.set(`cat_${c.id}`, allCatVideos);
                            console.warn(`%c[REPEAT] ${c.name}: ${allCatVideos.length} videos (including current)`, 'background: #a29bfe; color: white; padding: 3px; font-weight: bold;');
                        }
                        return result;
                    })
                    .filter((c: any) => c.videos.length > 0);

                // Add current video's category as a tab if not already featured
                if (video?.category_id && !featuredIds.has(video.category_id)) {
                    const catName = video.category_name || categoryMap.get(String(video.category_id)) || "";
                    if (catName) {
                        // For display: filter out current video
                        const displayCatVideos = filtered.filter((v: any) => v.category_id === video.category_id);
                        // For repeat mode: include current video
                        const allCatVideos = allVideosForRepeat.filter((v: any) => v.category_id === video.category_id);
                        const displayVideos = displayCatVideos.slice(0, 10);
                        if (allCatVideos.length > 0) {
                            // Insert at the beginning so it's the first tab
                            const matchingCat = allCats.find(c => c.id === video.category_id);
                            const isRepeatEnabled = matchingCat?.repeat_enabled ?? false;
                            featuredCats.unshift({ id: video.category_id, name: catName, videos: displayVideos, repeat_enabled: isRepeatEnabled });
                            // If repeat enabled, store all videos for looping
                            if (isRepeatEnabled) {
                                repeatModeAllVideos.set(`cat_${video.category_id}`, allCatVideos);
                            }
                        }
                    }
                }

                // Build featured playlists from home data (both curated + channel playlists)
                const allPlaylists = [
                    ...(homeData?.curatedPlaylists || []),
                    ...(homeData?.channelPlaylists || []),
                ];
                featuredPlaylists = allPlaylists
                    .filter((p: any) => p.is_featured)
                    .map((p: any) => ({ id: p.id, name: p.name, videos: [], loading: false, repeat_enabled: p.repeat_enabled }));

                // Set default tab: match current video's category, else "Other Videos"
                const currentCatTab = video?.category_id
                    ? featuredCats.find(c => String(c.id) === String(video.category_id))
                    : null;
                if (currentCatTab) {
                    activeRecTab = `cat_${currentCatTab.id}`;
                    currentCategoryId = currentCatTab.id;
                    currentCategoryRepeat = currentCatTab.repeat_enabled ?? false;
                    // All videos already stored in repeatModeAllVideos during map()
                } else if (otherVideos.length > 0) {
                    activeRecTab = 'other';
                    currentCategoryId = null;
                    currentPlaylistId = null;
                    currentCategoryRepeat = false;
                    currentPlaylistRepeat = false;
                } else if (channelVideos.length > 0) {
                    activeRecTab = 'channel';
                    currentCategoryId = null;
                    currentPlaylistId = null;
                    currentCategoryRepeat = false;
                    currentPlaylistRepeat = false;
                } else if (featuredCats.length > 0) {
                    activeRecTab = `cat_${featuredCats[0].id}`;
                    currentCategoryId = featuredCats[0].id;
                    currentCategoryRepeat = featuredCats[0].repeat_enabled ?? false;
                    // All videos already stored in repeatModeAllVideos during map()
                }

                // Store all filtered for the active tab
                allFilteredVideos = getVideosForTab(activeRecTab);

                // Helper function to find video by id, youtube_id, or title
                const findVideoIndex = (vids: any[], currentVid: any): number => {
                    return vids.findIndex((v: any) =>
                        v.id === currentVid?.id ||
                        v.youtube_id === currentVid?.youtube_id ||
                        v.title === currentVid?.title
                    );
                };

                // Initialize repeat mode counter if enabled
                if (currentCategoryRepeat && currentCategoryId !== null) {
                    const allVids = repeatModeAllVideos.get(`cat_${currentCategoryId}`);
                    if (allVids && allVids.length > 0) {
                        repeatTotalVideos = allVids.length;
                        repeatVideosList = allVids;
                        // Find current video position in the list (try multiple fields)
                        const currentPos = findVideoIndex(allVids, video);
                        repeatCurrentIndex = currentPos >= 0 ? currentPos + 1 : 1; // 1-indexed
                        console.warn(`%c🔁 REPEAT MODE INITIALIZED: ${repeatCurrentIndex}/${repeatTotalVideos} videos (found at index ${currentPos})`, 'background: #4caf80; color: white; padding: 5px; font-weight: bold;');
                    }
                } else if (currentPlaylistRepeat && currentPlaylistId !== null) {
                    const allVids = repeatModeAllVideos.get(`pl_${currentPlaylistId}`);
                    if (allVids && allVids.length > 0) {
                        repeatTotalVideos = allVids.length;
                        repeatVideosList = allVids;
                        // Find current video position in the list (try multiple fields)
                        const currentPos = findVideoIndex(allVids, video);
                        repeatCurrentIndex = currentPos >= 0 ? currentPos + 1 : 1; // 1-indexed
                        console.warn(`%c🔁 REPEAT MODE INITIALIZED: ${repeatCurrentIndex}/${repeatTotalVideos} videos (found at index ${currentPos})`, 'background: #4caf80; color: white; padding: 5px; font-weight: bold;');
                    }
                }

                // On desktop, load more initially since the sidebar is taller
                const initialCount = (!isMobile && !isTablet) ? INITIAL_LOAD * 3 : INITIAL_LOAD;
                const count = Math.min(initialCount, MAX_RECOMMENDATIONS, allFilteredVideos.length);
                recommendations = allFilteredVideos.slice(0, count);
                displayedCount = count;
            }
        } catch (e) {
            console.error("Failed to load video", e);
        }
        loading = false;

        // Always hide info section (description + comments) by default
        infoCollapsed = true;

        // On desktop, check if we need to load more after initial render
        if (!isMobile && !isTablet) {
            setTimeout(checkAndFillSidebar, 200);
        }

        // Load YouTube IFrame API for duration-based auto-exit
        setTimeout(loadYouTubeAPI, 1500);

        return () => {
            window.removeEventListener("resize", checkDevice);
            window.removeEventListener("scroll", handleWindowScroll);
            if (autoPlayTimer) clearInterval(autoPlayTimer);
        };
    });

    // Check if sidebar needs more content and fill it
    function checkAndFillSidebar() {
        if (recListElement && !isMobile && !isTablet) {
            const scrollBottom = recListElement.scrollHeight - recListElement.scrollTop - recListElement.clientHeight;
            // If there's not much to scroll, load more
            if (scrollBottom < 100 && displayedCount < MAX_RECOMMENDATIONS && displayedCount < allFilteredVideos.length) {
                loadMoreRecommendations();
                // Check again after loading
                setTimeout(checkAndFillSidebar, 200);
            }
        }
    }

    // Handle window scroll for mobile/tablet (vertical layout)
    function handleWindowScroll() {
        if (isMobile || isTablet) {
            const scrollBottom = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
            if (scrollBottom < 300 && !loadingMore && displayedCount < MAX_RECOMMENDATIONS && displayedCount < allFilteredVideos.length) {
                loadMoreRecommendations();
            }
        }
    }

    function handleRecScroll(event: Event) {
        const target = event.target as HTMLElement;
        const scrollBottom = target.scrollHeight - target.scrollTop - target.clientHeight;

        // Load more when user scrolls near the bottom (within 200px)
        if (scrollBottom < 200 && !loadingMore && displayedCount < MAX_RECOMMENDATIONS && displayedCount < allFilteredVideos.length) {
            loadMoreRecommendations();
        }
    }

    function loadMoreRecommendations() {
        if (loadingMore || displayedCount >= MAX_RECOMMENDATIONS || displayedCount >= allFilteredVideos.length) {
            return;
        }

        loadingMore = true;

        // Simulate a small delay for smoother UX
        setTimeout(() => {
            const newCount = Math.min(displayedCount + LOAD_MORE_COUNT, MAX_RECOMMENDATIONS, allFilteredVideos.length);
            recommendations = allFilteredVideos.slice(0, newCount);
            displayedCount = newCount;
            loadingMore = false;
        }, 100);
    }

    function checkDevice() {
        const w = window.innerWidth;
        isMobile = w < 768;
        isTablet = w >= 768 && w < 1200;
        isTV = w >= 1920;
    }

    function shuffleArray(arr: any[]) {
        const shuffled = [...arr];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    function getCategoryName(vid: any): string {
        if (vid?.category_id && categoryMap.has(vid.category_id.toString())) {
            return categoryMap.get(vid.category_id.toString()) || "YouTube";
        }
        return vid?.channel_name || "YouTube";
    }

    function getTimeAgo(vid: any): string {
        const dateStr = vid?.published_at || vid?.created_at;
        if (!dateStr) return "";
        const date = new Date(dateStr);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays === 0) return "Today";
        if (diffDays === 1) return "1 day ago";
        if (diffDays < 7) return `${diffDays} days ago`;
        if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
        if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
        return `${Math.floor(diffDays / 365)} years ago`;
    }

    function getViews(vid: any): string {
        const count = vid?.view_count;
        if (!count) return "No views";
        if (count >= 1000000) return (count / 1000000).toFixed(1) + "M views";
        if (count >= 1000) return Math.floor(count / 1000) + "K views";
        return count + " views";
    }

    function formatDuration(seconds: number | null | undefined): string {
        if (!seconds) return "";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        return `${m}:${String(s).padStart(2, '0')}`;
    }

    function formatNumber(n: number): string {
        if (n >= 1000000) return (n / 1000000).toFixed(1) + "M";
        if (n >= 1000) return Math.floor(n / 1000) + "K";
        return n.toString();
    }

    function goBack() {
        window.location.href = "/youtube";
    }

    function openVideo(vid: any) {
        window.location.href = `/yt-watch?id=${vid.id}`;
    }

    function getVideoEmbedUrl(vid: any): string {
        if (!vid) return "";

        const ytId = vid.youtube_id || "";
        const sourceType = vid.source_type || "youtube";

        if (sourceType === "youtube" || !sourceType) {
            // Enable JS API and set HD quality (vq=hd1080 for 1080p, hd720 for 720p)
            return `https://www.youtube.com/embed/${ytId}?autoplay=1&rel=0&modestbranding=1&playsinline=1&enablejsapi=1&vq=hd1080`;
        } else if (sourceType === "vimeo") {
            return `https://player.vimeo.com/video/${ytId}?autoplay=1&quality=1080p`;
        }

        return ytId;
    }

    function getVideosForTab(tab: string): any[] {
        if (tab === 'channel') return channelVideos;
        if (tab === 'other') return otherVideos;
        if (tab.startsWith('pl_')) {
            const pl = featuredPlaylists.find(p => `pl_${p.id}` === tab);
            return pl ? pl.videos : [];
        }
        const cat = featuredCats.find(c => `cat_${c.id}` === tab);
        return cat ? cat.videos : [];
    }

    // Lazy load playlist videos when tab is first selected
    async function loadPlaylistVideos(playlistId: number) {
        const pl = featuredPlaylists.find(p => p.id === playlistId);
        if (!pl || pl.videos.length > 0 || pl.loading) return;
        pl.loading = true;
        featuredPlaylists = featuredPlaylists; // trigger reactivity
        try {
            const headers = getPublicApiHeaders();
            const res = await fetch(`${API_BASE}/videos?playlist_id=${playlistId}`, { headers });
            if (res.ok) {
                const data = await res.json();
                const allVids = Array.isArray(data) ? data : data.items || [];

                // For repeat mode: store ALL videos (don't limit, don't filter)
                if (pl.repeat_enabled) {
                    repeatModeAllVideos.set(`pl_${playlistId}`, allVids);
                }

                // For display: filter out current video and show first 20
                pl.videos = allVids.filter((v: any) => v.id != video?.id).slice(0, 20);
            }
        } catch (e) {
            console.error('Failed to load playlist videos', e);
        }
        pl.loading = false;
        featuredPlaylists = featuredPlaylists; // trigger reactivity
        // Update recommendations if this is the active tab
        if (activeRecTab === `pl_${playlistId}`) {
            allFilteredVideos = pl.videos;
            const initialCount = (!isMobile && !isTablet) ? INITIAL_LOAD * 3 : INITIAL_LOAD;
            const count = Math.min(initialCount, MAX_RECOMMENDATIONS, allFilteredVideos.length);
            recommendations = allFilteredVideos.slice(0, count);
            displayedCount = count;
        }
    }

    // Switch recommendation tab
    function switchRecTab(tab: string) {
        activeRecTab = tab;
        repeatModePlayedVideos.clear(); // Reset played videos when switching tabs

        // Update repeat context based on tab
        if (tab.startsWith('cat_')) {
            const catId = parseInt(tab.replace('cat_', ''));
            currentCategoryId = catId;
            currentPlaylistId = null;
            const cat = featuredCats.find(c => c.id === catId);
            currentCategoryRepeat = cat?.repeat_enabled ?? false;
            currentPlaylistRepeat = false;
            // Note: All videos already stored in repeatModeAllVideos during onMount or initial load
        } else if (tab.startsWith('pl_')) {
            const plId = parseInt(tab.replace('pl_', ''));
            currentPlaylistId = plId;
            currentCategoryId = null;
            const pl = featuredPlaylists.find(p => p.id === plId);
            currentPlaylistRepeat = pl?.repeat_enabled ?? false;
            currentCategoryRepeat = false;
            loadPlaylistVideos(plId); // This will store all videos if repeat_enabled
        } else {
            currentCategoryId = null;
            currentPlaylistId = null;
            currentCategoryRepeat = false;
            currentPlaylistRepeat = false;
        }

        allFilteredVideos = getVideosForTab(tab);
        const initialCount = (!isMobile && !isTablet) ? INITIAL_LOAD * 3 : INITIAL_LOAD;
        const count = Math.min(initialCount, MAX_RECOMMENDATIONS, allFilteredVideos.length);
        recommendations = allFilteredVideos.slice(0, count);
        displayedCount = count;

        // Reset scroll position
        if (recListElement) {
            recListElement.scrollTop = 0;
        }
    }

    // Double-tap/click fullscreen toggle
    function handlePlayerClick(event: MouseEvent) {
        const now = Date.now();
        const timeDiff = now - lastClickTime;

        if (timeDiff < DOUBLE_CLICK_DELAY && timeDiff > 0) {
            // Double click detected - toggle fullscreen
            toggleFullscreen();
            lastClickTime = 0; // Reset
        } else {
            lastClickTime = now;
        }
    }

    function toggleFullscreen() {
        if (!playerWrapper) return;

        const iframe = playerWrapper.querySelector('iframe');
        if (!iframe) return;

        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else {
            // Try to fullscreen the iframe first
            if (iframe.requestFullscreen) {
                iframe.requestFullscreen();
            } else if (playerWrapper.requestFullscreen) {
                playerWrapper.requestFullscreen();
            }
        }
    }

    // YouTube IFrame Player API integration
    function loadYouTubeAPI() {
        if ((window as any).YT && (window as any).YT.Player) {
            createYTPlayer();
            return;
        }
        const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
        if (existingScript) {
            const check = setInterval(() => {
                if ((window as any).YT && (window as any).YT.Player) {
                    clearInterval(check);
                    createYTPlayer();
                }
            }, 200);
            return;
        }
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        (window as any).onYouTubeIframeAPIReady = () => {
            createYTPlayer();
        };
    }

    function createYTPlayer() {
        const iframe = document.querySelector('.player-wrapper iframe') as HTMLIFrameElement;
        if (!iframe) return;
        if (!iframe.id) iframe.id = 'yt-player-iframe';
        try {
            ytPlayer = new (window as any).YT.Player(iframe.id, {
                events: {
                    onStateChange: onYTStateChange,
                }
            });
        } catch (e) {
            console.error('Failed to create YT player', e);
        }
    }

    function onYTStateChange(event: any) {
        const state = event.data;
        if (state === 0) { // ended - wait 1 second then trigger autoplay
            if (!videoEnded) {
                setTimeout(() => onVideoEnding(), 1000);
            }
        }
    }

    // Pick a random next video from featured categories/playlists, avoiding current video
    let nextAutoplayVideo: any = null;

    function pickNextAutoplayVideo(): any {
        // REPEAT MODE: If in a category/playlist with repeat enabled, loop through ALL videos sequentially
        if (currentCategoryRepeat && currentCategoryId !== null) {
            const allVids = repeatModeAllVideos.get(`cat_${currentCategoryId}`);
            if (allVids && allVids.length > 0) {
                // Update UI tracking
                repeatTotalVideos = allVids.length;
                repeatVideosList = allVids;

                // Find next unplayed video in sequential order
                for (let i = 0; i < allVids.length; i++) {
                    const v = allVids[i];
                    if (v.id !== video?.id && !repeatModePlayedVideos.has(v.id)) {
                        repeatModePlayedVideos.add(v.id);
                        repeatCurrentIndex = repeatModePlayedVideos.size;
                        console.warn(`%c[REPEAT] Now playing: ${repeatCurrentIndex}/${repeatTotalVideos}`, 'background: #ffa502; color: white; padding: 5px; font-weight: bold;');
                        return v;
                    }
                }
                // All videos have been played, reset and start from beginning
                if (allVids.length > 0) {
                    console.log(`[REPEAT] All videos played! Resetting. Total videos: ${allVids.length}`);
                    repeatModePlayedVideos.clear();
                    // Return first video that's not current
                    const first = allVids.find(v => v.id !== video?.id);
                    if (first) {
                        repeatModePlayedVideos.add(first.id);
                        console.log(`[REPEAT] Looping back to first video: ${first.id} (${first.title})`);
                        return first;
                    }
                    // Fallback: if only 1 video, still loop it
                    console.log(`[REPEAT] Only 1 video in repeat list, looping`);
                    return allVids[0];
                }
            }
        }

        if (currentPlaylistRepeat && currentPlaylistId !== null) {
            const allVids = repeatModeAllVideos.get(`pl_${currentPlaylistId}`);
            if (allVids && allVids.length > 0) {
                // Update UI tracking
                repeatTotalVideos = allVids.length;
                repeatVideosList = allVids;

                // Find next unplayed video in sequential order
                for (let i = 0; i < allVids.length; i++) {
                    const v = allVids[i];
                    if (v.id !== video?.id && !repeatModePlayedVideos.has(v.id)) {
                        repeatModePlayedVideos.add(v.id);
                        repeatCurrentIndex = repeatModePlayedVideos.size;
                        console.warn(`%c[REPEAT] Now playing: ${repeatCurrentIndex}/${repeatTotalVideos}`, 'background: #ffa502; color: white; padding: 5px; font-weight: bold;');
                        return v;
                    }
                }
                // All videos have been played, reset and start from beginning
                if (allVids.length > 0) {
                    console.log(`[REPEAT] All videos played! Resetting. Total videos: ${allVids.length}`);
                    repeatModePlayedVideos.clear();
                    // Return first video that's not current
                    const first = allVids.find(v => v.id !== video?.id);
                    if (first) {
                        repeatModePlayedVideos.add(first.id);
                        console.log(`[REPEAT] Looping back to first video: ${first.id} (${first.title})`);
                        return first;
                    }
                    // Fallback: if only 1 video, still loop it
                    console.log(`[REPEAT] Only 1 video in repeat list, looping`);
                    return allVids[0];
                }
            }
        }

        // NORMAL MODE: Gather all candidate pools: featured categories, current tab, channel videos
        const pools: any[][] = [];

        // Add all featured category pools
        for (const cat of featuredCats) {
            if (cat.videos.length > 0) pools.push(cat.videos);
        }

        // Add loaded featured playlist pools
        for (const pl of featuredPlaylists) {
            if (pl.videos.length > 0) pools.push(pl.videos);
        }

        // Add channel and other videos
        if (channelVideos.length > 0) pools.push(channelVideos);
        if (otherVideos.length > 0) pools.push(otherVideos);

        if (pools.length === 0) return null;

        // Pick a random pool (this gives variety across categories)
        const pool = pools[Math.floor(Math.random() * pools.length)];

        // Filter out current video from the pool
        const candidates = pool.filter((v: any) => v.id != video?.id);
        if (candidates.length === 0) return null;

        // Pick random video from the pool
        return candidates[Math.floor(Math.random() * candidates.length)];
    }

    // Video ending (3s before end) or ended - hide player and optionally auto-play next
    function onVideoEnding() {
        if (videoEnded) return;

        // Pause the YouTube player to prevent related videos from showing
        try { ytPlayer?.pauseVideo?.(); } catch (e) {}

        videoEnded = true;

        if (!autoPlayEnabled || autoPlayCancelled) return;

        nextAutoplayVideo = pickNextAutoplayVideo();
        if (!nextAutoplayVideo) return;

        autoPlayCountdown = 5;
        autoPlayTimer = setInterval(() => {
            autoPlayCountdown--;
            if (autoPlayCountdown <= 0) {
                clearInterval(autoPlayTimer!);
                openVideo(nextAutoplayVideo);
            }
        }, 1000);
    }

    function cancelAutoPlay() {
        autoPlayCancelled = true;
        videoEnded = false;
        nextAutoplayVideo = null;
        if (autoPlayTimer) {
            clearInterval(autoPlayTimer);
            autoPlayTimer = null;
        }
    }

    function playNextNow() {
        if (autoPlayTimer) clearInterval(autoPlayTimer);
        if (nextAutoplayVideo) {
            openVideo(nextAutoplayVideo);
        } else {
            const picked = pickNextAutoplayVideo();
            if (picked) openVideo(picked);
        }
    }

    function playPreviousVideo() {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = "/youtube";
        }
    }

    function jumpToNextQueueVideo() {
        if (repeatCurrentIndex < repeatTotalVideos) {
            const nextVid = repeatVideosList[repeatCurrentIndex];
            if (nextVid) {
                // Mark current video as played
                if (video?.id) {
                    repeatModePlayedVideos.add(video.id);
                }
                // Close modal and navigate to next video
                showRepeatModal = false;
                openVideo(nextVid);
            }
        }
    }

    $: randomLikes = Math.floor(Math.random() * 500000) + 1000;
    $: randomViews = Math.floor(Math.random() * 5000000) + 10000;
    $: channelLink = video?.channel_id ? `/youtube?channel_id=${video.channel_id}` :
                     video?.category_id ? `/youtube?category_id=${video.category_id}` : '/youtube';
</script>

<svelte:head>
    <title>{video?.title || "Watch"} - YouTube</title>
</svelte:head>

<div class="yt-watch" class:mobile={isMobile} class:tablet={isTablet} class:tv={isTV}>
    {#if loading}
        <div class="loading">
            <div class="spinner"></div>
        </div>
    {:else if !video}
        <div class="error">
            <p>Video not found</p>
            <button on:click={goBack}>Go Back</button>
        </div>
    {:else}
        <div class="watch-content">
            <!-- Main video section -->
            <div class="video-section">
                <!-- Player -->
                <div class="player-wrapper" bind:this={playerWrapper}>
                    <iframe
                        src={getVideoEmbedUrl(video)}
                        frameborder="0"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        referrerpolicy="strict-origin-when-cross-origin"
                        allowfullscreen
                        title={video.title}
                    ></iframe>
                    <!-- Click blocker for top area (title/channel info) -->
                    <div class="yt-top-blocker"></div>
                    <!-- Click blocker for YouTube logo (bottom right, leaves fullscreen accessible) -->
                    <div class="yt-logo-blocker"></div>
                    <!-- Double-tap zones on left and right sides for fullscreen toggle -->
                    <div class="fullscreen-tap-left" on:dblclick={toggleFullscreen}></div>
                    <div class="fullscreen-tap-right" on:dblclick={toggleFullscreen}></div>

                    <!-- Player controls overlay (visible on hover) -->
                    <div class="player-controls-overlay">
                        <button class="ctrl-btn ctrl-home" on:click={goBack} title="Home">
                            <svg viewBox="0 0 28 20" width="28" height="20">
                                <path fill="#FF0000" d="M27.9727 3.12324C27.6435 1.89323 26.6768 0.926623 25.4468 0.597366C23.2197 0 14.285 0 14.285 0C14.285 0 5.35042 0 3.12323 0.597366C1.89323 0.926623 0.926623 1.89323 0.597366 3.12324C0 5.35042 0 10 0 10C0 10 0 14.6496 0.597366 16.8768C0.926623 18.1068 1.89323 19.0734 3.12323 19.4026C5.35042 20 14.285 20 14.285 20C14.285 20 23.2197 20 25.4468 19.4026C26.6768 19.0734 27.6435 18.1068 27.9727 16.8768C28.5701 14.6496 28.5701 10 28.5701 10C28.5701 10 28.5677 5.35042 27.9727 3.12324Z"/>
                                <path fill="white" d="M11.4253 14.2854L18.8477 10.0004L11.4253 5.71533V14.2854Z"/>
                            </svg>
                        </button>
                        <button class="ctrl-btn ctrl-prev" on:click={playPreviousVideo} title="Previous video">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path fill="currentColor" d="M15.41 16.59L10.83 12l4.58-4.59L14 6l-6 6 6 6 1.41-1.41z"/>
                            </svg>
                        </button>
                        <button class="ctrl-btn ctrl-next" on:click={playNextNow} title="Next video">
                            <svg viewBox="0 0 24 24" width="24" height="24">
                                <path fill="currentColor" d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z"/>
                            </svg>
                        </button>
                    </div>

                    <!-- Video ending overlay -->
                    {#if videoEnded}
                        <div class="autoplay-overlay">
                            {#if autoPlayEnabled && !autoPlayCancelled && nextAutoplayVideo}
                                <div class="autoplay-content">
                                    <p class="autoplay-title">Up next in {autoPlayCountdown}...</p>
                                    <div class="autoplay-next-video">
                                        <div class="autoplay-thumb">
                                            <img src={`https://img.youtube.com/vi/${nextAutoplayVideo.youtube_id}/mqdefault.jpg`} alt={nextAutoplayVideo.title} />
                                        </div>
                                        <div class="autoplay-info">
                                            <h4>{nextAutoplayVideo.title}</h4>
                                            <p>{getCategoryName(nextAutoplayVideo)}</p>
                                        </div>
                                    </div>
                                    <div class="autoplay-buttons">
                                        <button class="autoplay-cancel" on:click={cancelAutoPlay}>Cancel</button>
                                        <button class="autoplay-play" on:click={playNextNow}>Play Now</button>
                                    </div>
                                </div>
                            {:else}
                                <div class="autoplay-content">
                                    <p class="autoplay-title">Video ended</p>
                                    <div class="autoplay-buttons">
                                        <button class="autoplay-play" on:click={() => { videoEnded = false; autoPlayCancelled = false; try { ytPlayer?.seekTo?.(0); ytPlayer?.playVideo?.(); } catch(e) {} }}>Replay</button>
                                        {#if recommendations.length > 0}
                                            <button class="autoplay-play" on:click={playNextNow}>Next Video</button>
                                        {/if}
                                    </div>
                                </div>
                            {/if}
                        </div>
                    {/if}
                </div>

                <!-- Video info -->
                <div class="video-info">
                    <h1 class="video-title">{video.title}</h1>

                    <div class="video-actions-row">
                        <div class="channel-info">
                            <a href={channelLink} class="channel-info-link">
                                <div class="channel-avatar">
                                    <span>{getCategoryName(video).charAt(0).toUpperCase()}</span>
                                </div>
                                <div class="channel-meta">
                                    <span class="channel-name">{video.channel_name || getCategoryName(video)}</span>
                                    <span class="subscribers">{formatNumber(Math.floor(Math.random() * 10000000))} subscribers</span>
                                </div>
                            </a>
                            <button class="subscribe-btn">Subscribe</button>
                            <div style="display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                                <label class="autoplay-inline">
                                    <input type="checkbox" bind:checked={autoPlayEnabled} />
                                    <span>Autoplay</span>
                                </label>
                                {#if currentCategoryRepeat || currentPlaylistRepeat}
                                    <button class="repeat-indicator" on:click={() => showRepeatModal = true} title="Click to see all videos in repeat list">
                                        <span class="repeat-icon">🔁</span>
                                        <span class="repeat-text">Repeat {currentPlaylistRepeat ? 'Playlist' : 'Category'}</span>
                                        {#if repeatTotalVideos > 0}
                                            <span class="repeat-counter">{repeatCurrentIndex}/{repeatTotalVideos}</span>
                                        {/if}
                                    </button>
                                {/if}
                            </div>
                        </div>

                        <div class="action-buttons">
                            <button class="action-btn like">
                                <svg viewBox="0 0 24 24" width="20" height="20">
                                    <path fill="currentColor" d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"/>
                                </svg>
                                <span>{formatNumber(randomLikes)}</span>
                            </button>
                            <button class="action-btn dislike">
                                <svg viewBox="0 0 24 24" width="20" height="20">
                                    <path fill="currentColor" d="M15 3H6c-.83 0-1.54.5-1.84 1.22l-3.02 7.05c-.09.23-.14.47-.14.73v2c0 1.1.9 2 2 2h6.31l-.95 4.57-.03.32c0 .41.17.79.44 1.06L9.83 23l6.59-6.59c.36-.36.58-.86.58-1.41V5c0-1.1-.9-2-2-2zm4 0v12h4V3h-4z"/>
                                </svg>
                            </button>
                            <button class="action-btn share">
                                <svg viewBox="0 0 24 24" width="20" height="20">
                                    <path fill="currentColor" d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/>
                                </svg>
                                <span>Share</span>
                            </button>
                            <button class="action-btn save">
                                <svg viewBox="0 0 24 24" width="20" height="20">
                                    <path fill="currentColor" d="M14 10H2v2h12v-2zm0-4H2v2h12V6zm4 8v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zM2 16h8v-2H2v2z"/>
                                </svg>
                                <span>Save</span>
                            </button>
                            <!-- Toggle info section button -->
                            <button class="action-btn info-toggle" on:click={() => infoCollapsed = !infoCollapsed} title={infoCollapsed ? 'Show details' : 'Hide details'}>
                                <svg viewBox="0 0 24 24" width="20" height="20" class:rotated={!infoCollapsed}>
                                    <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                                </svg>
                            </button>
                        </div>
                    </div>

                    <!-- Collapsible Description & Comments -->
                    {#if !infoCollapsed}
                        <!-- Description -->
                        <div class="description-box" class:expanded={descExpanded}>
                            <div class="desc-header">
                                <span>{getViews(video)}</span>
                                <span>•</span>
                                <span>{getTimeAgo(video)}</span>
                            </div>
                            <p class="desc-text">
                                {video.description || `Watch ${video.title} on KFY Tube. Enjoy this amazing video from ${getCategoryName(video)}.`}
                            </p>
                            {#if !descExpanded}
                                <button class="show-more" on:click={() => descExpanded = true}>
                                    Show more
                                </button>
                            {:else}
                                <button class="show-more" on:click={() => descExpanded = false}>
                                    Show less
                                </button>
                            {/if}
                        </div>

                        <!-- Comments section -->
                        <Comments videoId={video.id} />
                    {/if}
                </div>
            </div>

            <!-- Recommendations sidebar -->
            <aside class="recommendations" bind:this={recListElement} on:scroll={handleRecScroll}>
                <!-- Recommendation tabs - featured categories first, then channel/other -->
                {#if featuredCats.length > 0 || featuredPlaylists.length > 0 || channelVideos.length > 0 || otherVideos.length > 0}
                <div class="rec-tabs">
                    {#each featuredCats as cat}
                    <button
                        class="rec-tab"
                        class:active={activeRecTab === `cat_${cat.id}`}
                        on:click={() => switchRecTab(`cat_${cat.id}`)}
                    >
                        {cat.name} ({cat.videos.length})
                    </button>
                    {/each}
                    {#each featuredPlaylists as pl}
                    <button
                        class="rec-tab"
                        class:active={activeRecTab === `pl_${pl.id}`}
                        on:click={() => switchRecTab(`pl_${pl.id}`)}
                        title={pl.name}
                    >
                        {pl.name.length > 6 ? pl.name.slice(0, 6) : pl.name}{pl.loading ? '...' : pl.videos.length > 0 ? ` (${pl.videos.length})` : ''}
                    </button>
                    {/each}
                    {#if channelVideos.length > 0}
                    <button
                        class="rec-tab"
                        class:active={activeRecTab === 'channel'}
                        on:click={() => switchRecTab('channel')}
                    >
                        From Channel ({channelVideos.length})
                    </button>
                    {/if}
                    {#if otherVideos.length > 0}
                    <button
                        class="rec-tab"
                        class:active={activeRecTab === 'other'}
                        on:click={() => switchRecTab('other')}
                    >
                        Other Videos ({otherVideos.length})
                    </button>
                    {/if}
                </div>
                {/if}
                <h3 class="rec-title">Recommended videos</h3>
                <div class="rec-list">
                    {#if activeRecTab.startsWith('pl_') && featuredPlaylists.find(p => `pl_${p.id}` === activeRecTab)?.loading}
                        <div class="loading-more"><div class="spinner-small"></div></div>
                    {/if}
                    {#each recommendations as rec}
                        <button class="rec-card" on:click={() => openVideo(rec)}>
                            <div class="rec-thumb">
                                {#if rec.source_type === "youtube" || !rec.source_type}
                                    <img
                                        src={`https://img.youtube.com/vi/${rec.youtube_id}/mqdefault.jpg`}
                                        alt={rec.title}
                                        loading="lazy"
                                    />
                                {:else}
                                    <div class="rec-placeholder {rec.source_type}">
                                        <span>{rec.source_type}</span>
                                    </div>
                                {/if}
                                {#if rec.duration}<span class="duration">{formatDuration(rec.duration)}</span>{/if}
                            </div>
                            <div class="rec-info">
                                <h4 class="rec-video-title">{rec.title}</h4>
                                <p class="rec-channel">{getCategoryName(rec)}</p>
                                <p class="rec-stats">{getViews(rec)} • {getTimeAgo(rec)}</p>
                            </div>
                        </button>
                    {/each}
                    {#if loadingMore}
                        <div class="loading-more">
                            <div class="spinner-small"></div>
                        </div>
                    {/if}
                    {#if displayedCount >= MAX_RECOMMENDATIONS || displayedCount >= allFilteredVideos.length}
                        <p class="end-of-list">No more recommendations</p>
                    {/if}
                </div>
            </aside>
        </div>

        <!-- Repeat Mode List Modal -->
        {#if showRepeatModal && repeatVideosList.length > 0}
            <div class="modal-overlay" on:click={() => showRepeatModal = false}>
                <div class="repeat-modal" on:click|stopPropagation>
                    <div class="repeat-modal-header">
                        <div>
                            <h3>🔁 Repeat Queue - {repeatTotalVideos} Videos</h3>
                            <p class="queue-status">Now Playing: <strong>{repeatCurrentIndex}/{repeatTotalVideos}</strong></p>
                            <div class="next-video-info">
                                {#if repeatCurrentIndex < repeatTotalVideos}
                                    <button class="next-queue-btn" on:click={jumpToNextQueueVideo} title="Click to play next video">
                                        <span class="pin-icon">📌</span>
                                        <span class="next-label">Next in Queue:</span>
                                        <span class="next-title">{repeatVideosList[repeatCurrentIndex]?.title || 'Loading...'}</span>
                                    </button>
                                {:else}
                                    <p class="loop-message"><strong>🔄</strong> After this: Loop back to start</p>
                                {/if}
                            </div>
                        </div>
                        <button class="modal-close" on:click={() => showRepeatModal = false}>✕</button>
                    </div>
                    <div class="repeat-modal-body">
                        <table class="repeat-table">
                            <thead>
                                <tr>
                                    <th class="col-num">#</th>
                                    <th class="col-title">Video Title</th>
                                    <th class="col-status">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each repeatVideosList as v, idx (v.id)}
                                    <tr class="video-row" class:current={idx === repeatCurrentIndex - 1} class:played={repeatModePlayedVideos.has(v.id)}>
                                        <td class="col-num">{idx + 1}</td>
                                        <td class="col-title">{v.title}</td>
                                        <td class="col-status">
                                            {#if idx === repeatCurrentIndex - 1}
                                                <span class="status-badge now-playing">▶ Now Playing</span>
                                            {:else if repeatModePlayedVideos.has(v.id)}
                                                <span class="status-badge played">✓ Played</span>
                                            {:else}
                                                <span class="status-badge pending">Pending</span>
                                            {/if}
                                        </td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        {/if}
    {/if}
</div>

<style>
    .yt-watch {
        --yt-bg: #0f0f0f;
        --yt-bg-secondary: #272727;
        --yt-bg-hover: #3f3f3f;
        --yt-text: #f1f1f1;
        --yt-text-secondary: #aaa;
        --yt-red: #ff0000;

        background: var(--yt-bg);
        color: var(--yt-text);
        min-height: 100vh;
        font-family: 'Roboto', 'Arial', sans-serif;
        overflow-x: hidden;
        box-sizing: border-box;
    }

    .yt-watch *, .yt-watch *::before, .yt-watch *::after {
        box-sizing: border-box;
    }

    /* Loading / Error */
    .loading, .error {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100vh;
    }

    .spinner {
        width: 48px;
        height: 48px;
        border: 4px solid #333;
        border-top-color: var(--yt-red);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .error button {
        margin-top: 16px;
        background: var(--yt-red);
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        cursor: pointer;
    }

    /* Watch content layout */
    .watch-content {
        display: flex;
        gap: 24px;
        padding: 16px 24px 24px;
        max-width: 1800px;
        margin: 0 auto;
    }

    .video-section {
        flex: 1;
        max-width: 1280px;
    }

    /* Player */
    .player-wrapper {
        position: relative;
        width: 100%;
        aspect-ratio: 16/9;
        background: #000;
        border-radius: 12px;
        overflow: hidden;
    }

    .player-wrapper iframe {
        width: 100%;
        height: 100%;
        border: none;
    }

    /* Click blocker for top area (title/channel info) */
    .yt-top-blocker {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        height: 50px;
        z-index: 10;
        background: transparent;
        pointer-events: auto;
    }

    /* Click blocker for YouTube logo - positioned to leave fullscreen button accessible */
    .yt-logo-blocker {
        position: absolute;
        bottom: 0;
        right: 40px;
        width: 120px;
        height: 40px;
        z-index: 10;
        background: transparent;
        pointer-events: auto;
    }

    /* Double-tap fullscreen zones on left and right sides */
    .fullscreen-tap-left,
    .fullscreen-tap-right {
        position: absolute;
        top: 50px;
        bottom: 50px;
        width: 25%;
        z-index: 5;
        background: transparent;
        cursor: pointer;
    }

    .fullscreen-tap-left {
        left: 0;
    }

    .fullscreen-tap-right {
        right: 0;
    }

    /* Auto-play overlay */
    .autoplay-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 20;
    }

    .autoplay-content {
        text-align: center;
        max-width: 400px;
        padding: 24px;
    }

    .autoplay-title {
        font-size: 18px;
        margin: 0 0 16px;
        color: var(--yt-text);
    }

    .autoplay-next-video {
        display: flex;
        gap: 12px;
        align-items: flex-start;
        text-align: left;
        margin-bottom: 20px;
    }

    .autoplay-thumb {
        width: 160px;
        aspect-ratio: 16/9;
        border-radius: 8px;
        overflow: hidden;
        flex-shrink: 0;
    }

    .autoplay-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .autoplay-info {
        flex: 1;
        min-width: 0;
    }

    .autoplay-info h4 {
        font-size: 14px;
        margin: 0 0 4px;
        color: var(--yt-text);
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .autoplay-info p {
        font-size: 12px;
        color: var(--yt-text-secondary);
        margin: 0;
    }

    .autoplay-buttons {
        display: flex;
        gap: 12px;
        justify-content: center;
    }

    .autoplay-cancel {
        background: var(--yt-bg-secondary);
        color: var(--yt-text);
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        font-size: 14px;
        cursor: pointer;
    }

    .autoplay-cancel:hover {
        background: var(--yt-bg-hover);
    }

    .autoplay-play {
        background: white;
        color: black;
        border: none;
        padding: 10px 20px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
    }

    .autoplay-play:hover {
        background: #e0e0e0;
    }

    /* Player controls overlay (visible on hover) */
    .player-controls-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 15;
        opacity: 0;
        transition: opacity 0.3s;
        pointer-events: none;
    }

    .player-wrapper:hover .player-controls-overlay {
        opacity: 1;
    }

    .ctrl-btn {
        position: absolute;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        border: none;
        color: white;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        transition: background 0.2s, transform 0.2s;
    }

    .ctrl-btn:hover {
        background: rgba(0, 0, 0, 0.85);
    }

    .ctrl-home {
        top: 12px;
        left: 12px;
    }

    .ctrl-home:hover {
        transform: scale(1.1);
    }

    .ctrl-prev {
        top: 50%;
        left: 12px;
        transform: translateY(-50%);
    }

    .ctrl-prev:hover {
        transform: translateY(-50%) scale(1.1);
    }

    .ctrl-next {
        top: 50%;
        right: 12px;
        transform: translateY(-50%);
    }

    .ctrl-next:hover {
        transform: translateY(-50%) scale(1.1);
    }

    /* Inline autoplay next to channel name */
    .autoplay-inline {
        display: flex;
        align-items: center;
        gap: 6px;
        cursor: pointer;
        font-size: 13px;
        color: var(--yt-text-secondary);
        user-select: none;
        margin-left: 12px;
        white-space: nowrap;
    }

    .autoplay-inline input[type="checkbox"] {
        width: 16px;
        height: 16px;
        accent-color: var(--yt-red);
        cursor: pointer;
    }

    /* Repeat mode indicator */
    .repeat-indicator {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: var(--yt-text-secondary);
        background: rgba(76, 175, 80, 0.1);
        padding: 6px 12px;
        border-radius: 4px;
        white-space: nowrap;
        border-left: 3px solid #4caf80;
        border: 1px solid #4caf80;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .repeat-indicator:hover {
        background: rgba(76, 175, 80, 0.2);
        transform: scale(1.02);
    }

    .repeat-icon {
        font-size: 14px;
    }

    .repeat-text {
        font-weight: 500;
    }

    .repeat-counter {
        font-size: 12px;
        background: #4caf80;
        color: white;
        padding: 2px 6px;
        border-radius: 3px;
        font-weight: bold;
    }

    /* Repeat mode modal - Table based */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .repeat-modal {
        background: var(--yt-bg-secondary);
        border-radius: 12px;
        max-width: 900px;
        max-height: 85vh;
        width: 95%;
        display: flex;
        flex-direction: column;
        box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    }

    .repeat-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 12px;
        padding: 20px;
        border-bottom: 2px solid var(--yt-bg-hover);
    }

    .repeat-modal-header > div:first-child {
        flex: 1;
        min-width: 0;
    }

    .repeat-modal-header h3 {
        margin: 0 0 8px 0;
        color: var(--yt-text);
        font-size: 18px;
        font-weight: 600;
    }

    .queue-status {
        margin: 0 0 8px 0;
        color: #4caf80;
        font-size: 13px;
        font-weight: 500;
    }

    .modal-close {
        background: none;
        border: none;
        color: var(--yt-text-secondary);
        font-size: 28px;
        cursor: pointer;
        padding: 0;
        width: 36px;
        height: 36px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: all 0.2s;
    }

    .modal-close:hover {
        background: var(--yt-bg-hover);
        color: var(--yt-text);
    }

    .repeat-modal-body {
        overflow-y: auto;
        padding: 0;
        flex: 1;
    }

    /* Table Styling */
    .repeat-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
    }

    .repeat-table thead {
        position: sticky;
        top: 0;
        background: var(--yt-bg);
        border-bottom: 2px solid var(--yt-bg-hover);
    }

    .repeat-table th {
        padding: 12px 16px;
        text-align: left;
        color: var(--yt-text-secondary);
        font-weight: 600;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .repeat-table td {
        padding: 14px 16px;
        border-bottom: 1px solid var(--yt-bg-hover);
        color: var(--yt-text);
    }

    .video-row {
        transition: background 0.15s ease;
        cursor: default;
    }

    .video-row:hover {
        background: rgba(255, 255, 255, 0.05);
    }

    .video-row.current {
        background: rgba(255, 165, 2, 0.25) !important;
        border-left: 5px solid #ffa502 !important;
        border-right: 2px solid rgba(255, 165, 2, 0.4) !important;
        font-weight: 600;
    }

    .video-row.current .col-title {
        color: #ffa502;
        font-weight: 600;
    }

    .video-row.current .col-num {
        color: #ffa502;
        font-weight: 700;
    }

    .video-row.played {
        opacity: 0.7;
        background: rgba(76, 175, 80, 0.05);
    }

    .col-num {
        width: 50px;
        text-align: center;
        font-weight: 600;
        color: var(--yt-text-secondary);
    }

    .col-title {
        flex: 1;
        word-break: break-word;
    }

    .col-status {
        width: 140px;
        text-align: center;
    }

    .status-badge {
        display: inline-block;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 600;
        white-space: nowrap;
    }

    .status-badge.now-playing {
        background: #ffa502;
        color: white;
        box-shadow: 0 0 8px rgba(255, 165, 2, 0.4);
        font-weight: 700;
    }

    .status-badge.played {
        background: #4caf80;
        color: white;
    }

    .status-badge.pending {
        background: var(--yt-bg-hover);
        color: var(--yt-text-secondary);
    }

    .next-video-info {
        margin: 12px 0 0 0;
        padding: 8px 0;
    }

    .next-queue-btn {
        background: linear-gradient(135deg, #ffa502, #ff8c00);
        border: none;
        border-radius: 6px;
        color: white;
        padding: 10px 14px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        width: 100%;
        max-width: 100%;
        transition: all 0.2s ease;
        white-space: normal;
        text-align: left;
        overflow: hidden;
        word-break: break-word;
    }

    .next-queue-btn:hover {
        background: linear-gradient(135deg, #ff8c00, #ff7000);
        transform: translateY(-2px);
        box-shadow: 0 4px 12px rgba(255, 165, 2, 0.3);
    }

    .next-queue-btn:active {
        transform: translateY(0);
    }

    .next-queue-btn .pin-icon {
        font-size: 16px;
        flex-shrink: 0;
    }

    .next-queue-btn .next-label {
        font-weight: 600;
        flex-shrink: 0;
    }

    .next-queue-btn .next-title {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    .loop-message {
        margin: 0;
        color: var(--yt-text-secondary);
        font-size: 13px;
        padding: 8px 0;
    }

    .loop-message strong {
        color: #4caf80;
    }

    /* Clickable channel info link */
    .channel-info-link {
        display: flex;
        align-items: center;
        gap: 12px;
        text-decoration: none;
        color: inherit;
        cursor: pointer;
    }

    .channel-info-link:hover .channel-name {
        color: var(--yt-text-secondary);
    }

    .channel-info-link:hover .channel-avatar {
        opacity: 0.8;
    }

    /* Info toggle button */
    .action-btn.info-toggle {
        padding: 8px 12px;
    }

    .action-btn.info-toggle svg {
        transition: transform 0.2s ease;
    }

    .action-btn.info-toggle svg.rotated {
        transform: rotate(180deg);
    }

    /* Video info */
    .video-info {
        padding: 16px 0;
    }

    .video-title {
        font-size: 20px;
        font-weight: 600;
        margin: 0 0 12px;
        line-height: 1.4;
    }

    .video-actions-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 16px;
        margin-bottom: 16px;
    }

    .channel-info {
        display: flex;
        align-items: center;
        gap: 12px;
    }

    .channel-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--yt-bg-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        font-weight: 500;
    }

    .channel-meta {
        display: flex;
        flex-direction: column;
    }

    .channel-name {
        font-size: 16px;
        font-weight: 500;
    }

    .subscribers {
        font-size: 12px;
        color: var(--yt-text-secondary);
    }

    .subscribe-btn {
        background: white;
        color: black;
        border: none;
        padding: 10px 16px;
        border-radius: 20px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        margin-left: 12px;
    }

    .subscribe-btn:hover {
        background: #e0e0e0;
    }

    .action-buttons {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
    }

    .action-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background: var(--yt-bg-secondary);
        border: none;
        color: var(--yt-text);
        padding: 8px 16px;
        border-radius: 20px;
        font-size: 14px;
        cursor: pointer;
    }

    .action-btn:hover {
        background: var(--yt-bg-hover);
    }

    .action-btn.like {
        border-radius: 20px 0 0 20px;
        padding-right: 12px;
    }

    .action-btn.dislike {
        border-radius: 0 20px 20px 0;
        padding-left: 12px;
        border-left: 1px solid #505050;
    }

    /* Description */
    .description-box {
        background: var(--yt-bg-secondary);
        border-radius: 12px;
        padding: 12px;
        margin-bottom: 24px;
        max-height: 120px;
        overflow: hidden;
        transition: max-height 0.3s;
    }

    .description-box.expanded {
        max-height: none;
    }

    .desc-header {
        display: flex;
        gap: 8px;
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 8px;
    }

    .desc-text {
        font-size: 14px;
        line-height: 1.5;
        margin: 0 0 8px;
        white-space: pre-wrap;
    }

    .show-more {
        background: none;
        border: none;
        color: var(--yt-text);
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        padding: 0;
    }

    /* Comments */
    .comments-section {
        margin-bottom: 24px;
    }

    .comments-section h3 {
        font-size: 16px;
        margin: 0 0 16px;
    }

    .comment-input {
        display: flex;
        gap: 12px;
        align-items: center;
    }

    .comment-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: var(--yt-bg-secondary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 500;
    }

    .comment-input input {
        flex: 1;
        background: transparent;
        border: none;
        border-bottom: 1px solid #505050;
        color: var(--yt-text);
        padding: 8px 0;
        font-size: 14px;
        outline: none;
    }

    /* Recommendations */
    .recommendations {
        width: 400px;
        flex-shrink: 0;
        max-height: calc(100vh - 32px);
        overflow-y: auto;
        position: sticky;
        top: 16px;
    }

    .recommendations::-webkit-scrollbar {
        width: 8px;
    }

    .recommendations::-webkit-scrollbar-track {
        background: transparent;
    }

    .recommendations::-webkit-scrollbar-thumb {
        background: #505050;
        border-radius: 4px;
    }

    .recommendations::-webkit-scrollbar-thumb:hover {
        background: #707070;
    }

    .loading-more {
        display: flex;
        justify-content: center;
        padding: 16px;
    }

    .spinner-small {
        width: 24px;
        height: 24px;
        border: 3px solid #333;
        border-top-color: var(--yt-red);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    .end-of-list {
        text-align: center;
        color: var(--yt-text-secondary);
        font-size: 12px;
        padding: 16px;
        margin: 0;
    }

    /* Recommendation tabs */
    .rec-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
        border-bottom: 1px solid #303030;
        padding-bottom: 12px;
    }

    .rec-tab {
        background: var(--yt-bg-secondary);
        border: none;
        color: var(--yt-text-secondary);
        padding: 8px 12px;
        border-radius: 8px;
        font-size: 12px;
        cursor: pointer;
        transition: background 0.2s, color 0.2s;
        white-space: nowrap;
    }

    .rec-tab:hover:not(:disabled) {
        background: var(--yt-bg-hover);
    }

    .rec-tab.active {
        background: var(--yt-text);
        color: var(--yt-bg);
    }

    .rec-tab:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .rec-title {
        font-size: 16px;
        margin: 0 0 16px;
        display: none;
    }

    .rec-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .rec-card {
        display: flex;
        gap: 8px;
        background: none;
        border: none;
        text-align: left;
        color: var(--yt-text);
        cursor: pointer;
        padding: 4px;
        border-radius: 8px;
    }

    .rec-card:hover {
        background: var(--yt-bg-secondary);
    }

    .rec-thumb {
        width: 168px;
        aspect-ratio: 16/9;
        border-radius: 8px;
        overflow: hidden;
        flex-shrink: 0;
        position: relative;
        background: #272727;
    }

    .rec-thumb img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .rec-thumb .duration {
        position: absolute;
        bottom: 4px;
        right: 4px;
        background: rgba(0,0,0,0.8);
        color: white;
        padding: 2px 4px;
        border-radius: 4px;
        font-size: 12px;
        font-weight: 500;
    }

    .rec-info {
        flex: 1;
        min-width: 0;
    }

    .rec-video-title {
        font-size: 14px;
        font-weight: 500;
        margin: 0 0 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
        line-height: 1.4;
    }

    .rec-channel, .rec-stats {
        font-size: 12px;
        color: var(--yt-text-secondary);
        margin: 0;
    }

    .rec-placeholder {
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: bold;
        text-transform: uppercase;
        font-size: 12px;
        background: #444;
    }

    .rec-placeholder.twitter { background: #1da1f2; }
    .rec-placeholder.tiktok { background: #000; }
    .rec-placeholder.instagram { background: linear-gradient(45deg, #f09433, #e6683c, #dc2743, #cc2366, #bc1888); }

    /* RESPONSIVE: Mobile */
    .yt-watch.mobile .watch-content {
        flex-direction: column;
        padding: 0;
        width: 100%;
        max-width: 100%;
    }

    .yt-watch.mobile .video-section {
        max-width: 100%;
        width: 100%;
    }

    .yt-watch.mobile .player-wrapper {
        border-radius: 0;
        width: 100%;
    }

    .yt-watch.mobile .video-info {
        padding: 12px;
        width: 100%;
        max-width: 100%;
    }

    .yt-watch.mobile .video-title {
        font-size: 16px;
        word-wrap: break-word;
        overflow-wrap: break-word;
    }

    .yt-watch.mobile .video-actions-row {
        flex-direction: column;
        align-items: stretch;
        gap: 12px;
    }

    .yt-watch.mobile .channel-info {
        width: 100%;
        flex-wrap: wrap;
        gap: 8px;
    }

    .yt-watch.mobile .channel-meta {
        flex: 1;
        min-width: 0;
    }

    .yt-watch.mobile .channel-name {
        font-size: 14px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .yt-watch.mobile .subscribe-btn {
        margin-left: auto;
        padding: 8px 12px;
        font-size: 12px;
    }

    .yt-watch.mobile .action-buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        width: 100%;
        justify-content: flex-start;
    }

    .yt-watch.mobile .action-btn {
        padding: 8px 12px;
        font-size: 12px;
        flex-shrink: 0;
    }

    .yt-watch.mobile .action-btn span {
        display: none;
    }

    .yt-watch.mobile .action-btn.like span {
        display: inline;
    }

    .yt-watch.mobile .autoplay-inline {
        margin-left: 0;
        margin-top: 8px;
        font-size: 12px;
    }

    .yt-watch.mobile .description-box {
        margin: 0 0 16px;
    }

    .yt-watch.mobile .recommendations {
        width: 100%;
        padding: 0 12px 24px;
        max-height: none;
        overflow-y: visible;
        position: static;
    }

    .yt-watch.mobile .rec-tabs {
        padding: 0 12px 12px;
        overflow-x: auto;
        scrollbar-width: none;
    }

    .yt-watch.mobile .rec-tabs::-webkit-scrollbar {
        display: none;
    }

    .yt-watch.mobile .rec-title {
        display: block;
    }

    .yt-watch.mobile .rec-card {
        width: 100%;
    }

    .yt-watch.mobile .autoplay-content {
        padding: 16px;
    }

    .yt-watch.mobile .autoplay-next-video {
        flex-direction: column;
    }

    .yt-watch.mobile .autoplay-thumb {
        width: 100%;
    }

    .yt-watch.mobile .rec-thumb {
        width: 120px;
        flex-shrink: 0;
    }

    .yt-watch.mobile .rec-info {
        flex: 1;
        min-width: 0;
        overflow: hidden;
    }

    .yt-watch.mobile .rec-video-title {
        word-wrap: break-word;
        overflow-wrap: break-word;
    }

    /* RESPONSIVE: Tablet */
    .yt-watch.tablet .watch-content {
        flex-direction: column;
        padding: 8px 16px 16px;
        width: 100%;
        max-width: 100%;
    }

    .yt-watch.tablet .video-section {
        width: 100%;
        max-width: 100%;
    }

    .yt-watch.tablet .video-info {
        padding: 16px;
    }

    .yt-watch.tablet .video-actions-row {
        flex-wrap: wrap;
        gap: 12px;
    }

    .yt-watch.tablet .channel-info {
        flex-wrap: wrap;
    }

    .yt-watch.tablet .action-buttons {
        flex-wrap: wrap;
    }

    .yt-watch.tablet .recommendations {
        width: 100%;
        padding: 0 16px 24px;
        max-height: none;
        overflow-y: visible;
        position: static;
    }

    .yt-watch.tablet .rec-title {
        display: block;
    }

    .yt-watch.tablet .rec-list {
        display: grid;
        grid-template-columns: repeat(2, 1fr);
        gap: 16px;
    }

    .yt-watch.tablet .rec-card {
        flex-direction: column;
        width: 100%;
    }

    .yt-watch.tablet .rec-thumb {
        width: 100%;
    }

    .yt-watch.tablet .rec-info {
        padding: 8px 0;
    }

    /* RESPONSIVE: TV / Wide Screen */
    .yt-watch.tv .watch-content {
        max-width: 2400px;
        gap: 32px;
    }

    .yt-watch.tv .video-title {
        font-size: 24px;
    }

    .yt-watch.tv .recommendations {
        width: 480px;
    }

    .yt-watch.tv .rec-thumb {
        width: 200px;
    }

    .yt-watch.tv .rec-video-title {
        font-size: 16px;
    }
</style>
