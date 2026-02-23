<script lang="ts">
    import { onMount, onDestroy } from "svelte";
    import { API_BASE, getPublicApiHeaders } from "../../lib/stores";

    let allShorts: any[] = [];
    let currentIndex = 0;
    let loading = true;

    // Swipe state
    let containerEl: HTMLElement;
    let touchStartY = 0;
    let touchStartX = 0;
    let touchCurrentY = 0;
    let isSwiping = false;
    let swipeOffset = 0;
    let isTransitioning = false;

    // Track which videos have been viewed (for auto-play)
    let playingIndex = 0;

    // Auto-play next short
    let autoPlayEnabled = true;
    let ytShortsPlayer: any = null;
    let autoAdvanceTimer: ReturnType<typeof setTimeout> | null = null;
    let shortEnded = false;

    onMount(async () => {
        // Lock body scroll only on this page
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.height = '100%';

        const params = new URLSearchParams(window.location.search);
        const videoId = params.get("id");

        const headers = getPublicApiHeaders();

        try {
            // If specific video requested, fetch it directly first
            let requestedVideo: any = null;
            if (videoId) {
                const videoRes = await fetch(`${API_BASE}/videos/${videoId}`, { headers });
                if (videoRes.ok) {
                    requestedVideo = await videoRes.json();
                }
            }

            // Fetch all shorts by paginating through all pages
            let allFetchedVideos: any[] = [];
            let page = 1;
            let hasMore = true;

            while (hasMore) {
                const res = await fetch(`${API_BASE}/videos?page=${page}&limit=50`, { headers });
                if (res.ok) {
                    const data = await res.json();
                    const items = Array.isArray(data) ? data : data.items || [];
                    allFetchedVideos = [...allFetchedVideos, ...items];

                    // Check if there are more pages
                    if (data.total_pages && page < data.total_pages) {
                        page++;
                    } else if (items.length < 50) {
                        hasMore = false;
                    } else if (!data.total_pages) {
                        hasMore = false;
                    } else {
                        hasMore = false;
                    }
                } else {
                    hasMore = false;
                }
            }

            // Filter shorts from all fetched videos
            allShorts = allFetchedVideos.filter((v: any) =>
                v.is_short === 1 ||
                v.is_short === true ||
                v.source_type === 'tiktok' ||
                v.youtube_id?.includes('/shorts/') ||
                v.url?.includes('/shorts/')
            );

            // If we have a requested video, ensure it's at the front
            if (requestedVideo) {
                // Remove it from list if it exists (to avoid duplicates)
                allShorts = allShorts.filter(s => String(s.id) !== String(videoId));
                // Add it to the front
                allShorts = [requestedVideo, ...allShorts];
                currentIndex = 0;
            }

            playingIndex = currentIndex;
        } catch (e) {
            console.error("Failed to load shorts", e);
        }
        loading = false;

        // Keyboard navigation
        window.addEventListener("keydown", handleKeydown);

        // Load YouTube IFrame API for auto-advance detection
        setTimeout(loadYouTubeAPI, 1500);

        return () => {
            // Restore body scroll when leaving this page
            document.body.style.overflow = '';
            document.body.style.position = '';
            document.body.style.width = '';
            document.body.style.height = '';
            window.removeEventListener("keydown", handleKeydown);
            if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
            if (ytShortsPlayer) { try { ytShortsPlayer.destroy(); } catch(e) {} }
        };
    });

    function handleKeydown(e: KeyboardEvent) {
        if (isTransitioning) return;
        if (e.key === "ArrowUp" || e.key === "k") {
            navigateShort(-1);
        } else if (e.key === "ArrowDown" || e.key === "j" || e.key === " ") {
            e.preventDefault();
            navigateShort(1);
        } else if (e.key === "Escape") {
            goBack();
        }
    }

    // Debounce wheel events to prevent double-scrolling
    let lastWheelTime = 0;
    const WHEEL_COOLDOWN = 500; // ms between wheel navigations

    function handleWheel(e: WheelEvent) {
        if (isTransitioning) return;
        e.preventDefault();

        const now = Date.now();
        if (now - lastWheelTime < WHEEL_COOLDOWN) return;

        if (Math.abs(e.deltaY) > 30) {
            lastWheelTime = now;
            if (e.deltaY > 0) {
                navigateShort(1);
            } else {
                navigateShort(-1);
            }
        }
    }

    // Swipe detection thresholds
    const SWIPE_THRESHOLD = 30; // pixels - minimum movement to be considered a swipe
    let isActuallySwipingNow = false; // True once we've started swiping visually

    function handleTouchStart(e: TouchEvent) {
        if (isTransitioning) return;
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
        touchCurrentY = touchStartY;
        isSwiping = true;
        isActuallySwipingNow = false;
    }

    function handleTouchMove(e: TouchEvent) {
        if (!isSwiping || isTransitioning) return;

        touchCurrentY = e.touches[0].clientY;
        const deltaY = touchCurrentY - touchStartY;
        const deltaX = Math.abs(e.touches[0].clientX - touchStartX);

        // Only handle vertical swipes (ignore horizontal gestures)
        if (deltaX > Math.abs(deltaY)) {
            return;
        }

        // Only start visual swipe after threshold is reached
        if (Math.abs(deltaY) < SWIPE_THRESHOLD) {
            return;
        }

        isActuallySwipingNow = true;

        // Limit swipe resistance at boundaries
        if ((currentIndex === 0 && deltaY > 0) ||
            (currentIndex === allShorts.length - 1 && deltaY < 0)) {
            swipeOffset = deltaY * 0.3; // Resistance effect
        } else {
            swipeOffset = deltaY;
        }
    }

    function handleTouchEnd(e: TouchEvent) {
        if (!isSwiping || isTransitioning) return;
        isSwiping = false;

        // If we weren't actually swiping (no visual movement), let the iframe handle the tap
        if (!isActuallySwipingNow) {
            swipeOffset = 0;
            return;
        }

        isActuallySwipingNow = false;
        const deltaY = touchCurrentY - touchStartY;
        const threshold = window.innerHeight * 0.15; // 15% of screen height

        if (Math.abs(deltaY) > threshold) {
            if (deltaY < 0 && currentIndex < allShorts.length - 1) {
                // Swiped up - go to next
                navigateShort(1);
            } else if (deltaY > 0 && currentIndex > 0) {
                // Swiped down - go to previous
                navigateShort(-1);
            } else {
                // Bounce back
                swipeOffset = 0;
            }
        } else {
            // Bounce back
            swipeOffset = 0;
        }
    }

    function navigateShort(direction: number) {
        const newIndex = currentIndex + direction;
        if (newIndex < 0 || newIndex >= allShorts.length) {
            swipeOffset = 0;
            return;
        }

        // Clear any pending auto-advance
        if (autoAdvanceTimer) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; }
        shortEnded = false;

        isTransitioning = true;
        swipeOffset = 0;
        currentIndex = newIndex;
        playingIndex = newIndex;

        // Update URL
        const short = allShorts[currentIndex];
        const url = new URL(window.location.href);
        url.searchParams.set("id", short.id);
        url.searchParams.set("index", currentIndex.toString());
        window.history.replaceState({}, "", url);

        // Reset transition state and re-attach YT player to new active iframe
        setTimeout(() => {
            isTransitioning = false;
            setTimeout(attachPlayerToActive, 500);
        }, 400);
    }

    function goBack() {
        window.location.href = "/youtube";
    }

    function getShortVideoId(short: any): string {
        if (!short) return "";
        const ytId = short.youtube_id || "";
        if (ytId.includes('/shorts/')) {
            return ytId.split('/shorts/')[1]?.split('?')[0] || ytId;
        }
        return ytId;
    }

    // YouTube IFrame Player API for auto-advance
    function loadYouTubeAPI() {
        if ((window as any).YT && (window as any).YT.Player) {
            attachPlayerToActive();
            return;
        }
        const existingScript = document.querySelector('script[src*="youtube.com/iframe_api"]');
        if (existingScript) {
            const check = setInterval(() => {
                if ((window as any).YT && (window as any).YT.Player) {
                    clearInterval(check);
                    attachPlayerToActive();
                }
            }, 200);
            return;
        }
        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        document.head.appendChild(tag);
        (window as any).onYouTubeIframeAPIReady = () => {
            attachPlayerToActive();
        };
    }

    function attachPlayerToActive() {
        // Destroy previous player
        if (ytShortsPlayer) {
            try { ytShortsPlayer.destroy(); } catch(e) {}
            ytShortsPlayer = null;
        }

        const activeSlide = document.querySelector('.video-slide.active iframe') as HTMLIFrameElement;
        if (!activeSlide) return;
        if (!activeSlide.id) activeSlide.id = `shorts-player-${currentIndex}`;

        try {
            ytShortsPlayer = new (window as any).YT.Player(activeSlide.id, {
                events: {
                    onStateChange: onShortsStateChange,
                }
            });
        } catch(e) {
            console.error('Failed to attach YT player to short', e);
        }
    }

    function onShortsStateChange(event: any) {
        if (event.data === 0) { // ended
            // Immediately pause to prevent YouTube end screen from being interactive
            try { ytShortsPlayer?.pauseVideo?.(); } catch(e) {}
            shortEnded = true;

            if (autoPlayEnabled) {
                if (autoAdvanceTimer) clearTimeout(autoAdvanceTimer);
                autoAdvanceTimer = setTimeout(() => {
                    if (currentIndex < allShorts.length - 1) {
                        navigateShort(1);
                    }
                }, 2000);
            }
        } else if (event.data === 1) { // playing
            shortEnded = false;
        }
    }

    // Get visible shorts (current, prev, next for smooth transitions)
    $: visibleRange = {
        start: Math.max(0, currentIndex - 1),
        end: Math.min(allShorts.length, currentIndex + 2)
    };

    $: currentShort = allShorts[currentIndex];
</script>

<svelte:head>
    <title>{currentShort?.title || "Shorts"} - KFY Tube</title>
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
</svelte:head>

<div
    class="shorts-fullscreen"
    bind:this={containerEl}
    on:wheel|preventDefault={handleWheel}
    on:touchstart={handleTouchStart}
    on:touchmove|preventDefault={handleTouchMove}
    on:touchend={handleTouchEnd}
>
    {#if loading}
        <div class="loading-screen">
            <div class="loader"></div>
            <p>Loading shorts...</p>
        </div>
    {:else if allShorts.length === 0}
        <div class="empty-state">
            <svg viewBox="0 0 24 24" width="64" height="64">
                <path fill="currentColor" d="M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4h-4z"/>
            </svg>
            <p>No shorts available</p>
            <button class="back-btn" on:click={goBack}>Go Back</button>
        </div>
    {:else}
        <!-- Close button -->
        <button class="close-btn" on:click={goBack} aria-label="Close">
            <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
        </button>

        <!-- Video Stack -->
        <div
            class="video-stack"
            class:transitioning={isTransitioning}
            style="transform: translateY(calc({-currentIndex * 100}% + {swipeOffset}px))"
        >
            {#each allShorts as short, index}
                <div class="video-slide" class:active={index === currentIndex} style="transform: translateY({index * 100}%)">
                    <div class="video-wrapper">
                        {#if index >= visibleRange.start && index < visibleRange.end}
                            <iframe
                                src={`https://www.youtube.com/embed/${getShortVideoId(short)}?autoplay=${index === playingIndex ? 1 : 0}&controls=0&modestbranding=1&playsinline=1&rel=0&showinfo=0&mute=0&fs=0&iv_load_policy=3&disablekb=1&enablejsapi=1`}
                                frameborder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                referrerpolicy="strict-origin-when-cross-origin"
                                loading="lazy"
                                title={short.title}
                            ></iframe>
                        {/if}
                    </div>

                    <!-- Click blockers for top/bottom YouTube branding -->
                    <div class="click-blocker top"></div>
                    <div class="click-blocker bottom"></div>

                    <!-- Full overlay when video ends - blocks YouTube end screen -->
                    {#if index === currentIndex && shortEnded}
                        <div class="end-screen-blocker" on:click|stopPropagation={() => { shortEnded = false; try { ytShortsPlayer?.seekTo?.(0); ytShortsPlayer?.playVideo?.(); } catch(e) {} }}>
                            <div class="replay-hint">
                                <svg viewBox="0 0 24 24" width="36" height="36">
                                    <path fill="currentColor" d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
                                </svg>
                            </div>
                        </div>
                    {/if}

                    <!-- Video Info Overlay (minimal - counter + autoplay toggle) -->
                    <div class="video-overlay">
                        <div class="progress-counter">
                            <span class="counter-text">{currentIndex + 1}/{allShorts.length}</span>
                        </div>
                        {#if index === currentIndex}
                        <button
                            class="autoplay-toggle"
                            class:active={autoPlayEnabled}
                            on:click|stopPropagation={() => { autoPlayEnabled = !autoPlayEnabled; if (!autoPlayEnabled && autoAdvanceTimer) { clearTimeout(autoAdvanceTimer); autoAdvanceTimer = null; } }}
                            title={autoPlayEnabled ? 'Autoplay ON' : 'Autoplay OFF'}
                        >
                            <svg viewBox="0 0 24 24" width="18" height="18">
                                {#if autoPlayEnabled}
                                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/>
                                {:else}
                                    <path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5zM12 4c4.41 0 8 3.59 8 8s-3.59 8-8 8-8-3.59-8-8 3.59-8 8-8z"/>
                                {/if}
                            </svg>
                        </button>
                        {/if}
                    </div>
                </div>
            {/each}
        </div>

        <!-- Navigation arrows -->
        <div class="nav-arrows">
            <button
                class="nav-arrow up"
                on:click={() => navigateShort(-1)}
                disabled={currentIndex === 0}
                aria-label="Previous short"
            >
                <svg viewBox="0 0 24 24" width="28" height="28">
                    <path fill="currentColor" d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/>
                </svg>
            </button>
            <button
                class="nav-arrow down"
                on:click={() => navigateShort(1)}
                disabled={currentIndex === allShorts.length - 1}
                aria-label="Next short"
            >
                <svg viewBox="0 0 24 24" width="28" height="28">
                    <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
                </svg>
            </button>
        </div>

        <!-- Swipe hint (shows briefly on first load) -->
        <div class="swipe-hint" class:hidden={currentIndex > 0}>
            <svg viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
            </svg>
            <span>Swipe up for more</span>
        </div>
    {/if}
</div>

<style>
    .shorts-fullscreen {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: #000;
        color: #fff;
        font-family: 'Roboto', -apple-system, BlinkMacSystemFont, sans-serif;
        overflow: hidden;
        touch-action: none;
        -webkit-overflow-scrolling: touch;
    }

    /* Loading & Empty States */
    .loading-screen, .empty-state {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 16px;
    }

    .loader {
        width: 48px;
        height: 48px;
        border: 3px solid rgba(255,255,255,0.2);
        border-top-color: #ff0000;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }

    @keyframes spin {
        to { transform: rotate(360deg); }
    }

    .empty-state svg {
        opacity: 0.5;
    }

    .back-btn {
        margin-top: 16px;
        background: #ff0000;
        color: white;
        border: none;
        padding: 12px 32px;
        border-radius: 24px;
        font-size: 16px;
        font-weight: 500;
        cursor: pointer;
    }

    /* Close Button */
    .close-btn {
        position: fixed;
        top: 16px;
        left: 16px;
        z-index: 1000;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(10px);
        border: none;
        color: white;
        width: 44px;
        height: 44px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, background 0.2s;
    }

    .close-btn:hover {
        background: rgba(0, 0, 0, 0.8);
        transform: scale(1.1);
    }

    /* Video Stack */
    .video-stack {
        position: relative;
        width: 100%;
        height: 100%;
        will-change: transform;
    }

    .video-stack.transitioning {
        transition: transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    }

    .video-slide {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .video-wrapper {
        position: relative;
        width: 100%;
        height: 100%;
        max-width: 100vw;
        max-height: 100vh;
        background: #000;
    }

    .video-wrapper iframe {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        border: none;
        object-fit: cover;
    }

    /* Click blockers to prevent YouTube branding clicks */
    .click-blocker {
        position: absolute;
        left: 0;
        right: 0;
        z-index: 10;
        /* Transparent but blocks clicks */
        background: transparent;
        pointer-events: auto;
    }

    .click-blocker.top {
        top: 0;
        height: 20%;
    }

    .click-blocker.bottom {
        bottom: 0;
        height: 20%;
    }

    /* End screen blocker - covers entire player when video ends */
    .end-screen-blocker {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        z-index: 15;
        background: rgba(0, 0, 0, 0.5);
        pointer-events: auto;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
    }

    .replay-hint {
        width: 64px;
        height: 64px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(8px);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        transition: transform 0.2s, background 0.2s;
    }

    .end-screen-blocker:hover .replay-hint {
        background: rgba(255, 255, 255, 0.25);
        transform: scale(1.1);
    }

    /* Video Overlay */
    .video-overlay {
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        pointer-events: none;
        display: flex;
    }

    /* Navigation Arrows */
    .nav-arrows {
        position: fixed;
        right: 16px;
        top: 50%;
        transform: translateY(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        z-index: 100;
    }

    .nav-arrow {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.15);
        backdrop-filter: blur(10px);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all 0.2s ease;
    }

    .nav-arrow:hover:not(:disabled) {
        background: rgba(255, 255, 255, 0.25);
        transform: scale(1.1);
    }

    .nav-arrow:active:not(:disabled) {
        transform: scale(0.95);
    }

    .nav-arrow:disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .nav-arrow svg {
        filter: drop-shadow(0 1px 2px rgba(0,0,0,0.3));
    }

    /* Progress Counter */
    .progress-counter {
        position: absolute;
        right: 16px;
        bottom: 24px;
        display: flex;
        align-items: center;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        padding: 6px 12px;
        border-radius: 16px;
    }

    .counter-text {
        font-size: 13px;
        font-weight: 500;
        color: rgba(255,255,255,0.9);
    }

    /* Autoplay Toggle */
    .autoplay-toggle {
        position: absolute;
        left: 16px;
        bottom: 24px;
        background: rgba(0, 0, 0, 0.5);
        backdrop-filter: blur(4px);
        border: none;
        color: rgba(255,255,255,0.6);
        width: 36px;
        height: 36px;
        border-radius: 50%;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        pointer-events: auto;
        transition: all 0.2s;
        z-index: 20;
    }

    .autoplay-toggle.active {
        color: #ff0000;
        background: rgba(255, 255, 255, 0.15);
    }

    .autoplay-toggle:hover {
        background: rgba(255, 255, 255, 0.25);
    }

    /* Swipe Hint */
    .swipe-hint {
        position: fixed;
        bottom: 30px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        color: rgba(255,255,255,0.8);
        font-size: 13px;
        animation: bounce 2s infinite;
        z-index: 100;
        transition: opacity 0.5s;
    }

    .swipe-hint.hidden {
        opacity: 0;
        pointer-events: none;
    }

    @keyframes bounce {
        0%, 20%, 50%, 80%, 100% { transform: translateX(-50%) translateY(0); }
        40% { transform: translateX(-50%) translateY(-10px); }
        60% { transform: translateX(-50%) translateY(-5px); }
    }

    /* Desktop adjustments */
    @media (min-width: 768px) {
        .video-wrapper {
            max-width: 420px;
            max-height: 90vh;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        }

        .nav-arrows {
            right: calc(50% - 300px);
        }
    }

    /* Large desktop */
    @media (min-width: 1200px) {
        .video-wrapper {
            max-width: 480px;
        }

        .nav-arrows {
            right: calc(50% - 340px);
        }
    }
</style>
