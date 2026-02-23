<script lang="ts">
    import { onMount, tick } from "svelte";
    import { API_BASE } from "../../lib/stores";

    let videoId: string | null = null;
    let isIdle = false;
    let nextVideoId: string | null = null;
    let activeCat: string | null = null;
    // svelte-ignore non_reactive_update
    let idleTimer: any;
    let sourceType = "youtube";
    let playerHidden = false;
    let ytPlayer: any = null;
    let timeCheckInterval: any = null;
    let featuredCategories: any[] = [];
    let activeTabId: number | null = null;
    let containerEl: HTMLElement;

    onMount(async () => {
        const url = new URL(window.location.href);
        const v = url.searchParams.get("v");
        const idParam = url.searchParams.get("id");
        const cat = url.searchParams.get("cat");
        const s = url.searchParams.get("s");

        if (cat) activeCat = cat;

        if (idParam) {
            try {
                const res = await fetch(`${API_BASE}/videos/${idParam}`);
                if (res.ok) {
                    const data = await res.json();
                    videoId = data.youtube_id;
                    sourceType =
                        data.source_type ||
                        (data.thumbnail_url &&
                        !data.thumbnail_url.startsWith("http")
                            ? data.thumbnail_url
                            : "youtube");
                }
            } catch (e) {
                console.error("Failed to fetch video details", e);
            }
        } else if (v) {
            videoId = v;
            sourceType = s || "youtube";
            if (
                videoId &&
                (videoId.startsWith("http://") ||
                    videoId.startsWith("https://"))
            ) {
                sourceType = "html";
                if (videoId.includes("instagram.com")) sourceType = "instagram";
                else if (
                    videoId.includes("twitter.com") ||
                    videoId.includes("x.com")
                )
                    sourceType = "twitter";
                else if (videoId.includes("tiktok.com")) sourceType = "tiktok";
                else if (videoId.includes("facebook.com"))
                    sourceType = "facebook";
            }
        }

        // Fetch category videos to determine NEXT video
        if (videoId && cat) {
            try {
                const res = await fetch(
                    `${API_BASE}/videos?category_id=${cat}`,
                );
                if (res.ok) {
                    const data = await res.json();
                    const videos = data.items || data;
                    const idx = videos.findIndex(
                        (vid: any) => vid.youtube_id === videoId,
                    );
                    if (idx !== -1) {
                        const nextIdx = (idx + 1) % videos.length;
                        nextVideoId = videos[nextIdx].youtube_id;
                    }
                }
            } catch (e) {
                console.error("Failed to fetch videos for autoplay", e);
            }
        }

        // Fetch featured categories
        try {
            const res = await fetch(`${API_BASE}/categories/featured`);
            if (res.ok) {
                featuredCategories = await res.json();
                if (featuredCategories.length > 0) {
                    activeTabId = featuredCategories[0].id;
                }
            }
        } catch (e) {
            console.error("Failed to fetch featured categories", e);
        }

        // Wait for DOM to render the player div
        await tick();

        // For YouTube: use IFrame Player API for time tracking + fullscreen
        if (sourceType === "youtube" && videoId) {
            initYouTubePlayer();
        } else if (videoId) {
            // Non-YouTube: try fullscreen on container
            tryFullscreen();
        }

        // Idle timer
        resetTimer();
        window.addEventListener("mousemove", resetTimer);
        window.addEventListener("keydown", resetTimer);
        window.addEventListener("touchstart", resetTimer);

        return () => {
            clearTimeout(idleTimer);
            clearInterval(timeCheckInterval);
            window.removeEventListener("mousemove", resetTimer);
            window.removeEventListener("keydown", resetTimer);
            window.removeEventListener("touchstart", resetTimer);
        };
    });

    function initYouTubePlayer() {
        if ((window as any).YT && (window as any).YT.Player) {
            createPlayer();
            return;
        }
        (window as any).onYouTubeIframeAPIReady = () => createPlayer();
        const tag = document.createElement("script");
        tag.src = "https://www.youtube.com/iframe_api";
        document.head.appendChild(tag);
    }

    function createPlayer() {
        const el = document.getElementById("yt-player");
        if (!el) return;
        ytPlayer = new (window as any).YT.Player("yt-player", {
            width: "100%",
            height: "100%",
            videoId: videoId,
            playerVars: {
                autoplay: 1,
                rel: 0,
                modestbranding: 1,
                controls: 1,
                showinfo: 0,
                iv_load_policy: 3,
                playsinline: 1,
            },
            events: {
                onReady: onPlayerReady,
                onStateChange: onPlayerStateChange,
            },
        });
    }

    function onPlayerReady() {
        tryFullscreen();
    }

    function onPlayerStateChange(event: any) {
        const YT = (window as any).YT;
        if (event.data === YT.PlayerState.PLAYING) {
            startTimeCheck();
        } else if (event.data === YT.PlayerState.PAUSED) {
            clearInterval(timeCheckInterval);
        } else if (event.data === YT.PlayerState.ENDED) {
            clearInterval(timeCheckInterval);
            if (nextVideoId) {
                playNext();
            } else {
                hidePlayer();
            }
        }
    }

    function startTimeCheck() {
        clearInterval(timeCheckInterval);
        timeCheckInterval = setInterval(() => {
            if (!ytPlayer?.getCurrentTime || !ytPlayer?.getDuration) return;
            const current = ytPlayer.getCurrentTime();
            const duration = ytPlayer.getDuration();
            if (duration > 0 && duration - current <= 2) {
                hidePlayer();
            }
        }, 500);
    }

    function hidePlayer() {
        clearInterval(timeCheckInterval);
        playerHidden = true;
        exitFullscreen();
        if (ytPlayer?.pauseVideo) {
            ytPlayer.pauseVideo();
        }
    }

    function tryFullscreen() {
        setTimeout(() => {
            if (!containerEl) return;
            const el = containerEl as any;
            const fn =
                el.requestFullscreen ||
                el.webkitRequestFullscreen ||
                el.mozRequestFullScreen ||
                el.msRequestFullscreen;
            if (fn) fn.call(el).catch(() => {});
        }, 300);
    }

    function exitFullscreen() {
        const doc = document as any;
        if (doc.fullscreenElement || doc.webkitFullscreenElement) {
            const fn =
                doc.exitFullscreen ||
                doc.webkitExitFullscreen ||
                doc.mozCancelFullScreen ||
                doc.msExitFullscreen;
            if (fn) fn.call(doc).catch(() => {});
        }
    }

    function playNext() {
        if (!nextVideoId) return;
        const url = new URL(window.location.href);
        url.searchParams.set("v", nextVideoId);
        window.location.href = url.toString();
    }

    function resetTimer() {
        isIdle = false;
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
            isIdle = true;
        }, 10000);
    }

    function goBack() {
        exitFullscreen();
        if (activeCat) {
            window.location.href = `/?cat=${activeCat}`;
        } else {
            window.location.href = "/";
        }
    }

    function openVideo(ytId: string) {
        window.location.href = `/watch?v=${ytId}`;
    }

    function formatDuration(seconds: number | null | undefined): string {
        if (!seconds) return "0:00";
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        if (h > 0)
            return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
        return `${m}:${String(s).padStart(2, "0")}`;
    }

    function loadExternalScript(
        id: string,
        src: string,
        reloadCheck?: () => void,
    ) {
        if (document.getElementById(id)) {
            if (reloadCheck) reloadCheck();
            return;
        }
        const script = document.createElement("script");
        script.id = id;
        script.src = src;
        script.async = true;
        script.onload = () => {
            if (reloadCheck) reloadCheck();
        };
        document.body.appendChild(script);
    }

    $: if (sourceType === "instagram") {
        setTimeout(
            () =>
                loadExternalScript(
                    "insta-wjs",
                    "//www.instagram.com/embed.js",
                    () => (window as any).instgrm?.Embeds.process(),
                ),
            100,
        );
    }
    $: if (sourceType === "twitter") {
        setTimeout(
            () =>
                loadExternalScript(
                    "twitter-wjs",
                    "https://platform.twitter.com/widgets.js",
                    () => (window as any).twttr?.widgets?.load(),
                ),
            100,
        );
    }
    $: if (sourceType === "tiktok") {
        setTimeout(
            () =>
                loadExternalScript(
                    "tiktok-wjs",
                    "https://www.tiktok.com/embed.js",
                ),
            100,
        );
    }
</script>

<svelte:head>
    <title>Tube App</title>
</svelte:head>

<div class="watch-container" class:idle={isIdle} bind:this={containerEl}>
    {#if videoId}
        {#if !playerHidden}
            <div class="iframe-wrapper">
                <!-- Sensor Zone: Captures mouse movement at the top to reveal controls -->
                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div
                    class="sensor-zone"
                    on:mousemove={resetTimer}
                    on:click={resetTimer}
                ></div>

                {#if sourceType === "youtube"}
                    <div id="yt-player"></div>
                {:else if sourceType === "vimeo"}
                    <iframe
                        src={`https://player.vimeo.com/video/${videoId}?autoplay=1`}
                        frameborder="0"
                        allow="autoplay; fullscreen; picture-in-picture"
                        allowfullscreen
                        title="Vimeo"
                    ></iframe>
                {:else if sourceType === "instagram"}
                    {@const instaId = videoId.includes("instagram.com")
                        ? videoId.match(
                              /\/(p|reel)\/([a-zA-Z0-9_-]+)/,
                          )?.[2] || videoId
                        : videoId}
                    <div
                        class="instagram-wrapper"
                        style="width: 100%; height: 100%; display: flex; justify-content: center; align-items: center;"
                    >
                        <iframe
                            src={`https://www.instagram.com/p/${instaId}/embed/captioned/`}
                            width="400"
                            height="100%"
                            frameborder="0"
                            scrolling="no"
                            allowtransparency={true}
                            allowfullscreen={true}
                            style="background: white; max-width: 540px; border-radius: 3px;"
                            title="Instagram"
                        >
                        </iframe>
                    </div>
                {:else if sourceType === "twitter"}
                    <div
                        class="embed-wrapper twitter"
                        style="width:100%;display:flex;justify-content:center;align-items:center;height:100%;"
                    >
                        <blockquote class="twitter-tweet" data-theme="dark">
                            <a href={videoId}></a>
                        </blockquote>
                    </div>
                {:else if sourceType === "tiktok"}
                    <div
                        class="embed-wrapper tiktok"
                        style="width:100%;display:flex;justify-content:center;align-items:center;height:100%;"
                    >
                        <blockquote
                            class="tiktok-embed"
                            cite={videoId}
                            data-video-id={videoId}
                            style="max-width: 605px;min-width: 325px;"
                        >
                            <section>
                                <a target="_blank" href={videoId}></a>
                            </section>
                        </blockquote>
                    </div>
                {:else if sourceType === "facebook"}
                    <div
                        class="embed-wrapper facebook"
                        style="width:100%;display:flex;justify-content:center;align-items:center;height:100%;"
                    >
                        <iframe
                            src={`https://www.facebook.com/plugins/video.php?height=314&href=${encodeURIComponent(videoId)}&show_text=false&width=560&t=0`}
                            width="560"
                            height="314"
                            style="border:none;overflow:hidden"
                            scrolling="no"
                            frameborder="0"
                            allowfullscreen={true}
                            allow="autoplay; clipboard-write; encrypted-media; picture-in-picture; web-share"
                            title="Facebook"
                        ></iframe>
                    </div>
                {:else if sourceType === "html"}
                    <iframe
                        src={videoId}
                        class="web-frame"
                        frameborder="0"
                        allowfullscreen
                        title="Web Content"
                    ></iframe>
                {:else}
                    <div class="external-embed">
                        <h2>Content from {sourceType}</h2>
                        <p>This content requires an external player or script.</p>
                        <a
                            href={sourceType === "html" ? videoId : "#"}
                            target="_blank"
                            class="open-btn">Open Original Link</a
                        >
                    </div>
                {/if}

                <!-- svelte-ignore a11y-no-static-element-interactions -->
                <div class="controls-overlay" on:mousemove={resetTimer}>
                    <button class="back-btn" on:click={goBack}> ← Back </button>
                </div>
            </div>
        {:else}
            <!-- Player hidden (video near end) - show browse view -->
            <div class="ended-view">
                <div class="ended-header">
                    <button class="back-btn-large" on:click={goBack}>
                        ← Back to Home
                    </button>
                </div>

                {#if featuredCategories.length > 0}
                    <div class="featured-tabs">
                        {#each featuredCategories as cat}
                            <button
                                class="tab-btn"
                                class:active={activeTabId === cat.id}
                                on:click={() => (activeTabId = cat.id)}
                            >
                                {cat.name}
                            </button>
                        {/each}
                    </div>

                    <div class="featured-videos">
                        {#each featuredCategories as cat}
                            {#if activeTabId === cat.id}
                                <div class="video-grid">
                                    {#each cat.videos as video}
                                        <!-- svelte-ignore a11y-click-events-have-key-events -->
                                        <!-- svelte-ignore a11y-no-static-element-interactions -->
                                        <div
                                            class="video-card"
                                            on:click={() =>
                                                openVideo(video.youtube_id)}
                                        >
                                            <div class="thumb-wrapper">
                                                <img
                                                    src={video.thumbnail_url ||
                                                        `https://img.youtube.com/vi/${video.youtube_id}/mqdefault.jpg`}
                                                    alt={video.title}
                                                />
                                                {#if video.duration}
                                                    <span class="duration-badge"
                                                        >{formatDuration(
                                                            video.duration,
                                                        )}</span
                                                    >
                                                {/if}
                                            </div>
                                            <p class="video-title">
                                                {video.title}
                                            </p>
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        {/each}
                    </div>
                {:else}
                    <div class="no-featured">
                        <p>Video ended</p>
                        <button class="back-btn-large" on:click={goBack}>
                            Browse more videos
                        </button>
                    </div>
                {/if}
            </div>
        {/if}
    {:else}
        <div class="error">Loading...</div>
    {/if}
</div>

<style>
    .watch-container {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        background: black;
        z-index: 1000;
        display: flex;
        flex-direction: column;
    }
    .iframe-wrapper {
        flex: 1;
        position: relative;
    }
    iframe,
    :global(#yt-player) {
        width: 100%;
        height: 100%;
        border: none;
    }

    /* Sensor Zone: Invisible top area to catch mouse events */
    .sensor-zone {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 15%;
        z-index: 1001;
        cursor: default;
    }

    .controls-overlay {
        position: absolute;
        top: 20px;
        left: 20px;
        transition: opacity 0.3s ease;
        opacity: 1;
        pointer-events: auto;
        z-index: 1002;
    }

    .watch-container.idle .controls-overlay {
        opacity: 0;
        pointer-events: none;
    }

    .back-btn {
        background: rgba(0, 0, 0, 0.6);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.3);
        padding: 10px 20px;
        font-size: 1.2rem;
        cursor: pointer;
        border-radius: 8px;
        backdrop-filter: blur(4px);
    }
    .back-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }
    .error {
        color: white;
        font-size: 1.5rem;
        text-align: center;
        margin-top: 50px;
    }
    .web-frame {
        width: 100%;
        height: 100%;
        background: white;
    }
    .external-embed {
        width: 100%;
        height: 100%;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: white;
    }
    .open-btn {
        margin-top: 20px;
        background: #2563eb;
        color: white;
        padding: 10px 20px;
        text-decoration: none;
        border-radius: 4px;
        font-weight: bold;
    }

    /* --- Ended / Browse View --- */
    .ended-view {
        flex: 1;
        display: flex;
        flex-direction: column;
        padding: 24px;
        overflow-y: auto;
    }

    .ended-header {
        margin-bottom: 20px;
    }

    .back-btn-large {
        background: rgba(255, 255, 255, 0.1);
        color: white;
        border: 1px solid rgba(255, 255, 255, 0.2);
        padding: 12px 24px;
        font-size: 1rem;
        cursor: pointer;
        border-radius: 8px;
    }
    .back-btn-large:hover {
        background: rgba(255, 255, 255, 0.2);
    }

    .featured-tabs {
        display: flex;
        gap: 8px;
        margin-bottom: 20px;
        flex-wrap: wrap;
    }

    .tab-btn {
        background: rgba(255, 255, 255, 0.08);
        color: #aaa;
        border: 1px solid rgba(255, 255, 255, 0.15);
        padding: 8px 18px;
        font-size: 0.95rem;
        cursor: pointer;
        border-radius: 20px;
        transition: all 0.2s;
    }
    .tab-btn:hover {
        background: rgba(255, 255, 255, 0.15);
        color: white;
    }
    .tab-btn.active {
        background: #e53e3e;
        color: white;
        border-color: #e53e3e;
    }

    .featured-videos {
        flex: 1;
    }

    .video-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
        gap: 16px;
    }

    .video-card {
        cursor: pointer;
        border-radius: 8px;
        overflow: hidden;
        transition: transform 0.15s;
    }
    .video-card:hover {
        transform: scale(1.03);
    }

    .thumb-wrapper {
        position: relative;
        aspect-ratio: 16 / 9;
        background: #222;
        border-radius: 8px;
        overflow: hidden;
    }
    .thumb-wrapper img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .duration-badge {
        position: absolute;
        bottom: 4px;
        right: 4px;
        background: rgba(0, 0, 0, 0.8);
        color: white;
        font-size: 0.75rem;
        padding: 2px 6px;
        border-radius: 3px;
    }

    .video-title {
        color: #ddd;
        font-size: 0.85rem;
        margin: 6px 0 0;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
    }

    .no-featured {
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        color: #888;
        gap: 16px;
    }
    .no-featured p {
        font-size: 1.3rem;
    }
</style>
