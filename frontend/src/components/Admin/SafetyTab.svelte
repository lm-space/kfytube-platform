<script>
    import { onMount } from "svelte";
    import { API_BASE, token } from "../../lib/stores";

    let videos = [];
    let stats = null;
    let loading = false;
    let evaluating = false;
    let currentPage = 1;
    const pageSize = 20;
    let totalCount = 0;
    let selectedVideos = new Set();
    let notification = { message: "", type: "" };
    let statusFilter = "pending";
    let minScoreFilter = 0;

    onMount(loadData);

    async function loadData() {
        loading = true;
        try {
            await Promise.all([loadVideos(), loadStats()]);
        } finally {
            loading = false;
        }
    }

    async function loadVideos() {
        try {
            const res = await fetch(
                `${API_BASE}/safety/queue?status=${statusFilter}&minScore=${minScoreFilter}&limit=${pageSize}&offset=${(currentPage - 1) * pageSize}`,
                {
                    headers: { "Authorization": `Bearer ${$token}` }
                }
            );
            if (res.ok) {
                const data = await res.json();
                videos = data.items || [];
                totalCount = data.total || 0;
                selectedVideos.clear();
            }
        } catch (e) {
            console.error("Failed to load safety queue:", e);
            showNotification("Failed to load videos", "error");
        }
    }

    async function loadStats() {
        try {
            const res = await fetch(`${API_BASE}/safety/stats`, {
                headers: { "Authorization": `Bearer ${$token}` }
            });
            if (res.ok) {
                stats = await res.json();
            }
        } catch (e) {
            console.error("Failed to load stats:", e);
        }
    }

    function showNotification(message, type = "success") {
        notification = { message, type };
        setTimeout(() => {
            notification = { message: "", type: "" };
        }, 3000);
    }

    async function evaluateSelectedVideos() {
        if (selectedVideos.size === 0) {
            showNotification("Please select videos to evaluate", "error");
            return;
        }

        evaluating = true;
        try {
            const res = await fetch(`${API_BASE}/safety/evaluate`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${$token}`
                },
                body: JSON.stringify({
                    video_ids: Array.from(selectedVideos)
                })
            });

            if (res.ok) {
                const result = await res.json();
                showNotification(`Evaluated ${result.evaluated} videos`, "success");
                selectedVideos.clear();
                await loadData();
            } else {
                const error = await res.json();
                showNotification(error.error || "Evaluation failed", "error");
            }
        } catch (e) {
            console.error("Evaluation error:", e);
            showNotification("Evaluation failed", "error");
        } finally {
            evaluating = false;
        }
    }

    async function reviewVideo(videoId, action) {
        try {
            const res = await fetch(`${API_BASE}/safety/queue/${videoId}/review`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${$token}`
                },
                body: JSON.stringify({ action })
            });

            if (res.ok) {
                showNotification(`Video ${action === 'approve' ? 'approved' : 'rejected'}`, "success");
                await loadData();
            } else {
                showNotification("Review failed", "error");
            }
        } catch (e) {
            console.error("Review error:", e);
            showNotification("Review failed", "error");
        }
    }

    function toggleAllSelected() {
        if (selectedVideos.size === videos.length) {
            selectedVideos.clear();
        } else {
            videos.forEach(v => selectedVideos.add(v.id));
        }
        selectedVideos = selectedVideos;
    }

    function toggleVideo(videoId) {
        if (selectedVideos.has(videoId)) {
            selectedVideos.delete(videoId);
        } else {
            selectedVideos.add(videoId);
        }
        selectedVideos = selectedVideos;
    }

    function getScoreColor(score) {
        if (score === null) return "#999";
        if (score >= 80) return "#10b981";  // Green
        if (score >= 60) return "#f59e0b";  // Amber
        if (score >= 40) return "#ef5350";  // Red
        return "#b71c1c";  // Dark red
    }

    function getConcernEmoji(concern) {
        const emojiMap = {
            'violence': '⚠️',
            'inappropriate': '🚫',
            'scary': '😨',
            'low_value': '📉',
            'dangerous': '⛔',
            'mean': '😠',
            'screentimeish': '📱',
            'consumerism': '💰'
        };
        return emojiMap[concern] || '•';
    }
</script>

<style>
    .safety-container {
        padding: 20px;
    }

    .safety-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }

    .safety-title {
        font-size: 24px;
        font-weight: 600;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
        gap: 15px;
        margin-bottom: 30px;
    }

    .stat-card {
        background: #f5f5f5;
        padding: 15px;
        border-radius: 8px;
        text-align: center;
    }

    .stat-value {
        font-size: 28px;
        font-weight: 700;
        color: #333;
    }

    .stat-label {
        font-size: 12px;
        color: #999;
        text-transform: uppercase;
        margin-top: 5px;
    }

    .controls {
        display: flex;
        gap: 15px;
        margin-bottom: 20px;
        flex-wrap: wrap;
        align-items: center;
    }

    .filter-group {
        display: flex;
        gap: 10px;
        align-items: center;
    }

    .filter-group label {
        font-size: 14px;
        font-weight: 500;
    }

    .filter-group select {
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
    }

    .btn {
        padding: 10px 16px;
        border: none;
        border-radius: 6px;
        font-size: 14px;
        cursor: pointer;
        font-weight: 500;
        transition: all 0.2s;
    }

    .btn-primary {
        background: #3b82f6;
        color: white;
    }

    .btn-primary:hover {
        background: #2563eb;
    }

    .btn-primary:disabled {
        background: #ccc;
        cursor: not-allowed;
    }

    .btn-success {
        background: #10b981;
        color: white;
        padding: 6px 12px;
        font-size: 13px;
    }

    .btn-success:hover {
        background: #059669;
    }

    .btn-danger {
        background: #ef5350;
        color: white;
        padding: 6px 12px;
        font-size: 13px;
    }

    .btn-danger:hover {
        background: #c62828;
    }

    .videos-table {
        width: 100%;
        border-collapse: collapse;
        background: white;
        border: 1px solid #ddd;
        border-radius: 8px;
        overflow: hidden;
    }

    .videos-table thead {
        background: #f5f5f5;
        border-bottom: 1px solid #ddd;
    }

    .videos-table th {
        padding: 12px;
        text-align: left;
        font-weight: 600;
        font-size: 13px;
        text-transform: uppercase;
        color: #666;
    }

    .videos-table td {
        padding: 12px;
        border-bottom: 1px solid #eee;
        font-size: 14px;
    }

    .videos-table tr:hover {
        background: #fafafa;
    }

    .checkbox {
        width: 18px;
        height: 18px;
        cursor: pointer;
    }

    .score-badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        font-weight: 600;
        font-size: 12px;
        color: white;
    }

    .concerns-list {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .concern-tag {
        background: #f5f5f5;
        padding: 2px 8px;
        border-radius: 3px;
        font-size: 12px;
        border-left: 3px solid #ef5350;
    }

    .actions {
        display: flex;
        gap: 8px;
    }

    .notification {
        padding: 12px 16px;
        border-radius: 6px;
        margin-bottom: 20px;
        font-size: 14px;
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

    .loading {
        padding: 40px;
        text-align: center;
        color: #999;
    }

    .pagination {
        display: flex;
        justify-content: center;
        gap: 10px;
        margin-top: 20px;
    }

    .pagination button {
        padding: 8px 12px;
        border: 1px solid #ddd;
        background: white;
        cursor: pointer;
        border-radius: 4px;
        font-size: 14px;
    }

    .pagination button:hover:not(:disabled) {
        background: #f5f5f5;
    }

    .pagination button:disabled {
        color: #ccc;
        cursor: not-allowed;
    }

    .pagination .current {
        padding: 8px 12px;
        font-weight: 600;
    }

    .empty-state {
        padding: 40px;
        text-align: center;
        color: #999;
    }
</style>

<div class="safety-container">
    <div class="safety-header">
        <div class="safety-title">Content Safety Review</div>
    </div>

    {#if notification.message}
        <div class="notification {notification.type}">
            {notification.message}
        </div>
    {/if}

    {#if stats}
        <div class="stats-grid">
            <div class="stat-card">
                <div class="stat-value">{stats.total || 0}</div>
                <div class="stat-label">Total Videos</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{stats.pending || 0}</div>
                <div class="stat-label">Pending Review</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{stats.approved || 0}</div>
                <div class="stat-label">Approved</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{stats.rejected || 0}</div>
                <div class="stat-label">Rejected</div>
            </div>
            <div class="stat-card">
                <div class="stat-value">{stats.avg_score || 0}</div>
                <div class="stat-label">Avg Score</div>
            </div>
        </div>
    {/if}

    <div class="controls">
        <div class="filter-group">
            <label>Status:</label>
            <select bind:value={statusFilter} on:change={() => { currentPage = 1; loadVideos(); }}>
                <option value="pending">Pending</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
            </select>
        </div>

        <div class="filter-group">
            <label>Min Score:</label>
            <select bind:value={minScoreFilter} on:change={() => { currentPage = 1; loadVideos(); }}>
                <option value="0">All Scores</option>
                <option value="20">20+</option>
                <option value="40">40+</option>
                <option value="60">60+</option>
                <option value="80">80+</option>
            </select>
        </div>

        <button
            class="btn btn-primary"
            on:click={evaluateSelectedVideos}
            disabled={evaluating || selectedVideos.size === 0}
        >
            {evaluating ? "Evaluating..." : `Evaluate Selected (${selectedVideos.size})`}
        </button>
    </div>

    {#if loading}
        <div class="loading">Loading videos...</div>
    {:else if videos.length === 0}
        <div class="empty-state">
            No videos found with the current filters.
        </div>
    {:else}
        <table class="videos-table">
            <thead>
                <tr>
                    <th style="width: 30px;">
                        <input
                            type="checkbox"
                            class="checkbox"
                            checked={selectedVideos.size === videos.length && videos.length > 0}
                            on:change={toggleAllSelected}
                        />
                    </th>
                    <th>Title</th>
                    <th>Channel</th>
                    <th>Safety Score</th>
                    <th>Concerns</th>
                    <th>Status</th>
                    <th style="width: 120px;">Actions</th>
                </tr>
            </thead>
            <tbody>
                {#each videos as video (video.id)}
                    <tr>
                        <td>
                            <input
                                type="checkbox"
                                class="checkbox"
                                checked={selectedVideos.has(video.id)}
                                on:change={() => toggleVideo(video.id)}
                            />
                        </td>
                        <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis;">
                            {video.title}
                        </td>
                        <td>{video.channel_name || 'Unknown'}</td>
                        <td>
                            {#if video.kids_safety_score !== null}
                                <span
                                    class="score-badge"
                                    style="background-color: {getScoreColor(video.kids_safety_score)}"
                                >
                                    {Math.round(video.kids_safety_score)}%
                                </span>
                            {:else}
                                <span style="color: #999;">Not yet evaluated</span>
                            {/if}
                        </td>
                        <td>
                            {#if video.safety_concerns}
                                <div class="concerns-list">
                                    {#each JSON.parse(video.safety_concerns || '[]') as concern}
                                        <div class="concern-tag">
                                            {getConcernEmoji(concern)} {concern}
                                        </div>
                                    {/each}
                                </div>
                            {:else}
                                <span style="color: #999;">—</span>
                            {/if}
                        </td>
                        <td>
                            <span style="text-transform: capitalize; font-weight: 500;">
                                {video.safety_review_status}
                            </span>
                        </td>
                        <td>
                            <div class="actions">
                                {#if video.safety_review_status === 'pending'}
                                    <button
                                        class="btn btn-success"
                                        on:click={() => reviewVideo(video.id, 'approve')}
                                    >
                                        ✓ Approve
                                    </button>
                                    <button
                                        class="btn btn-danger"
                                        on:click={() => reviewVideo(video.id, 'reject')}
                                    >
                                        ✕ Reject
                                    </button>
                                {/if}
                            </div>
                        </td>
                    </tr>
                {/each}
            </tbody>
        </table>

        <div class="pagination">
            <button
                disabled={currentPage === 1}
                on:click={() => { currentPage = 1; loadVideos(); }}
            >
                First
            </button>
            <button
                disabled={currentPage === 1}
                on:click={() => { currentPage--; loadVideos(); }}
            >
                ← Previous
            </button>
            <span class="current">Page {currentPage} of {Math.ceil(totalCount / pageSize)}</span>
            <button
                disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                on:click={() => { currentPage++; loadVideos(); }}
            >
                Next →
            </button>
            <button
                disabled={currentPage >= Math.ceil(totalCount / pageSize)}
                on:click={() => { currentPage = Math.ceil(totalCount / pageSize); loadVideos(); }}
            >
                Last
            </button>
        </div>
    {/if}
</div>
