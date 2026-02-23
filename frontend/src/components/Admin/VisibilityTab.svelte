<script>
    import { onMount } from "svelte";
    import { API_BASE } from "../../lib/stores";

    let videos = [];
    let filteredVideos = [];
    let isLoading = false;
    let searchQuery = "";
    let currentPage = 1;
    let pageSize = 20;
    let totalVideos = 0;

    let notification = null;
    let notificationTimeout;

    function showNotification(msg, type = "success") {
        notification = { msg, type };
        if (notificationTimeout) clearTimeout(notificationTimeout);
        notificationTimeout = setTimeout(() => {
            notification = null;
        }, 3000);
    }

    onMount(async () => {
        await loadVideos();
    });

    async function loadVideos() {
        isLoading = true;
        try {
            const headers = { "Content-Type": "application/json" };
            const token = localStorage.getItem("token");
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const offset = (currentPage - 1) * pageSize;
            const res = await fetch(`${API_BASE}/videos?limit=${pageSize}&offset=${offset}`, { headers });
            if (res.ok) {
                const data = await res.json();
                videos = data.items || [];
                totalVideos = data.total || 0;
                filterVideos();
            }
        } catch (e) {
            console.error("Failed to load videos", e);
            showNotification("Failed to load videos", "error");
        }
        isLoading = false;
    }

    function filterVideos() {
        if (!searchQuery) {
            filteredVideos = videos;
        } else {
            filteredVideos = videos.filter(v =>
                v.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                v.youtube_id.toLowerCase().includes(searchQuery.toLowerCase())
            );
        }
    }

    $: if (searchQuery) filterVideos();

    async function toggleVisibility(videoId, isVisible) {
        try {
            const headers = { "Content-Type": "application/json" };
            const token = localStorage.getItem("token");
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const res = await fetch(`${API_BASE}/videos/${videoId}/visibility`, {
                method: "POST",
                headers,
                body: JSON.stringify({ is_visible: !isVisible })
            });

            if (res.ok) {
                // Update local state
                const video = videos.find(v => v.id === videoId);
                if (video) video.is_visible = !isVisible;
                filterVideos();
                showNotification(`Video ${!isVisible ? "shown" : "hidden"} successfully`, "success");
            } else {
                showNotification("Failed to update visibility", "error");
            }
        } catch (e) {
            console.error("Failed to toggle visibility", e);
            showNotification("Error updating visibility", "error");
        }
    }

    const totalPages = Math.ceil(totalVideos / pageSize);
</script>

<div class="visibility-tab">
    <h2>Video Visibility Management</h2>

    <div class="controls">
        <input
            type="text"
            placeholder="Search by title or YouTube ID..."
            bind:value={searchQuery}
            class="search-box"
        />
        <div class="pagination">
            <button on:click={() => { currentPage = Math.max(1, currentPage - 1); loadVideos(); }} disabled={currentPage === 1}>←</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button on:click={() => { currentPage = Math.min(totalPages, currentPage + 1); loadVideos(); }} disabled={currentPage === totalPages}>→</button>
        </div>
    </div>

    {#if notification}
        <div class="notification {notification.type}">
            {notification.msg}
        </div>
    {/if}

    {#if isLoading}
        <p>Loading videos...</p>
    {:else}
        <div class="videos-list">
            <table>
                <thead>
                    <tr>
                        <th>Title</th>
                        <th>YouTube ID</th>
                        <th>Status</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>
                    {#each filteredVideos as video (video.id)}
                        <tr class:hidden={!video.is_visible}>
                            <td class="title">{video.title}</td>
                            <td class="youtube-id">{video.youtube_id}</td>
                            <td class="status">
                                <span class="badge {video.is_visible ? 'visible' : 'hidden'}">
                                    {video.is_visible ? '✓ Visible' : '✕ Hidden'}
                                </span>
                            </td>
                            <td class="action">
                                <button
                                    on:click={() => toggleVisibility(video.id, video.is_visible)}
                                    class="toggle-btn {video.is_visible ? 'hide' : 'show'}"
                                >
                                    {video.is_visible ? 'Hide' : 'Show'}
                                </button>
                            </td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

<style>
    .visibility-tab {
        padding: 20px;
    }

    h2 {
        margin-bottom: 20px;
        color: #333;
    }

    .controls {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
        gap: 20px;
    }

    .search-box {
        flex: 1;
        padding: 10px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
    }

    .pagination {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .pagination button {
        padding: 8px 12px;
        border: 1px solid #ddd;
        background: white;
        border-radius: 4px;
        cursor: pointer;
    }

    .pagination button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .notification {
        padding: 12px;
        border-radius: 4px;
        margin-bottom: 15px;
        font-weight: 500;
    }

    .notification.success {
        background: #d4edda;
        color: #155724;
        border: 1px solid #c3e6cb;
    }

    .notification.error {
        background: #f8d7da;
        color: #721c24;
        border: 1px solid #f5c6cb;
    }

    .videos-list {
        overflow-x: auto;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
    }

    th {
        background: #f5f5f5;
        padding: 12px;
        text-align: left;
        font-weight: 600;
        border-bottom: 2px solid #ddd;
    }

    td {
        padding: 12px;
        border-bottom: 1px solid #eee;
    }

    tr.hidden {
        background: #fef5f5;
    }

    .title {
        max-width: 300px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .youtube-id {
        font-family: monospace;
        font-size: 12px;
        color: #666;
    }

    .status {
        text-align: center;
    }

    .badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 12px;
        font-size: 12px;
        font-weight: 500;
    }

    .badge.visible {
        background: #d4edda;
        color: #155724;
    }

    .badge.hidden {
        background: #f8d7da;
        color: #721c24;
    }

    .action {
        text-align: center;
    }

    .toggle-btn {
        padding: 6px 12px;
        border: none;
        border-radius: 4px;
        cursor: pointer;
        font-weight: 500;
        font-size: 13px;
        transition: all 0.2s;
    }

    .toggle-btn.show {
        background: #28a745;
        color: white;
    }

    .toggle-btn.show:hover {
        background: #218838;
    }

    .toggle-btn.hide {
        background: #dc3545;
        color: white;
    }

    .toggle-btn.hide:hover {
        background: #c82333;
    }
</style>
