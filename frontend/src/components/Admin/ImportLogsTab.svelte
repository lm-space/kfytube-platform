<script>
    import { onMount } from "svelte";
    import { API_BASE } from "../../lib/stores";

    let logs = [];
    let filteredLogs = [];
    let isLoading = false;
    let filterSource = "";
    let filterMethod = "";
    let currentPage = 1;
    let pageSize = 30;
    let totalLogs = 0;

    const sources = ["channel", "playlist", "search", "manual", "api"];
    const methods = ["auto", "manual"];

    onMount(async () => {
        await loadLogs();
    });

    async function loadLogs() {
        isLoading = true;
        try {
            const headers = { "Content-Type": "application/json" };
            const token = localStorage.getItem("token");
            if (token) headers["Authorization"] = `Bearer ${token}`;

            const offset = (currentPage - 1) * pageSize;
            let url = `${API_BASE}/import-logs?limit=${pageSize}&offset=${offset}`;
            if (filterSource) url += `&source=${filterSource}`;

            const res = await fetch(url, { headers });
            if (res.ok) {
                const data = await res.json();
                logs = data.items || [];
                totalLogs = data.total || 0;
                filterLogs();
            }
        } catch (e) {
            console.error("Failed to load import logs", e);
        }
        isLoading = false;
    }

    function filterLogs() {
        filteredLogs = logs.filter(log => {
            if (filterMethod && log.import_method !== filterMethod) return false;
            return true;
        });
    }

    $: if (filterMethod) filterLogs();

    function formatDate(dateStr) {
        return new Date(dateStr).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    function getBadgeColor(source) {
        const colors = {
            channel: '#007bff',
            playlist: '#6f42c1',
            search: '#28a745',
            manual: '#ffc107',
            api: '#17a2b8'
        };
        return colors[source] || '#6c757d';
    }

    const totalPages = Math.ceil(totalLogs / pageSize);
</script>

<div class="import-logs-tab">
    <h2>Video Import History</h2>

    <div class="controls">
        <select bind:value={filterSource} on:change={() => { currentPage = 1; loadLogs(); }}>
            <option value="">All Sources</option>
            {#each sources as source}
                <option value={source}>{source}</option>
            {/each}
        </select>

        <select bind:value={filterMethod} on:change={filterLogs}>
            <option value="">All Methods</option>
            {#each methods as method}
                <option value={method}>{method}</option>
            {/each}
        </select>

        <div class="pagination">
            <button on:click={() => { currentPage = Math.max(1, currentPage - 1); loadLogs(); }} disabled={currentPage === 1}>←</button>
            <span>Page {currentPage} of {totalPages}</span>
            <button on:click={() => { currentPage = Math.min(totalPages, currentPage + 1); loadLogs(); }} disabled={currentPage === totalPages}>→</button>
        </div>
    </div>

    <div class="stats">
        <div class="stat-item">
            <span class="label">Total Imports:</span>
            <span class="value">{totalLogs}</span>
        </div>
    </div>

    {#if isLoading}
        <p>Loading import history...</p>
    {:else}
        <div class="logs-list">
            {#each filteredLogs as log (log.id)}
                <div class="log-item">
                    <div class="log-header">
                        <div class="badges">
                            <span class="badge source" style="background: {getBadgeColor(log.import_source)}">
                                {log.import_source.toUpperCase()}
                            </span>
                            <span class="badge method" class:auto={log.import_method === 'auto'} class:manual={log.import_method === 'manual'}>
                                {log.import_method === 'auto' ? '⚙ Auto' : '👤 Manual'}
                            </span>
                        </div>
                        <span class="date">{formatDate(log.created_at)}</span>
                    </div>
                    <div class="log-content">
                        <div class="info-row">
                            <strong>Source:</strong>
                            {log.source_name || 'N/A'}
                        </div>
                        {#if log.imported_by}
                            <div class="info-row">
                                <strong>Imported By:</strong>
                                {log.imported_by}
                            </div>
                        {/if}
                        {#if log.video_id}
                            <div class="info-row">
                                <strong>Video ID:</strong>
                                <code>{log.video_id}</code>
                            </div>
                        {/if}
                        {#if log.metadata}
                            <div class="info-row">
                                <strong>Metadata:</strong>
                                <pre>{JSON.stringify(JSON.parse(log.metadata), null, 2)}</pre>
                            </div>
                        {/if}
                    </div>
                </div>
            {/each}

            {#if filteredLogs.length === 0}
                <p class="no-data">No import logs found</p>
            {/if}
        </div>
    {/if}
</div>

<style>
    .import-logs-tab {
        padding: 20px;
    }

    h2 {
        margin-bottom: 20px;
        color: #333;
    }

    .controls {
        display: flex;
        gap: 15px;
        margin-bottom: 20px;
        align-items: center;
        flex-wrap: wrap;
    }

    select {
        padding: 8px 12px;
        border: 1px solid #ddd;
        border-radius: 4px;
        font-size: 14px;
        background: white;
    }

    .pagination {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-left: auto;
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

    .stats {
        display: flex;
        gap: 20px;
        margin-bottom: 20px;
        padding: 15px;
        background: #f9f9f9;
        border-radius: 4px;
    }

    .stat-item {
        display: flex;
        align-items: center;
        gap: 10px;
    }

    .stat-item .label {
        font-weight: 600;
        color: #666;
    }

    .stat-item .value {
        font-size: 24px;
        font-weight: bold;
        color: #333;
    }

    .logs-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
    }

    .log-item {
        border: 1px solid #ddd;
        border-radius: 6px;
        overflow: hidden;
        background: white;
        transition: all 0.2s;
    }

    .log-item:hover {
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        border-color: #bbb;
    }

    .log-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 15px;
        background: #fafafa;
        border-bottom: 1px solid #eee;
    }

    .badges {
        display: flex;
        gap: 8px;
    }

    .badge {
        display: inline-block;
        padding: 4px 8px;
        border-radius: 4px;
        color: white;
        font-size: 12px;
        font-weight: 600;
    }

    .badge.source {
        /* Color set inline */
    }

    .badge.method.auto {
        background: #6c757d;
    }

    .badge.method.manual {
        background: #ffc107;
        color: #333;
    }

    .date {
        color: #666;
        font-size: 12px;
    }

    .log-content {
        padding: 12px 15px;
    }

    .info-row {
        margin-bottom: 8px;
        font-size: 14px;
    }

    .info-row strong {
        display: inline-block;
        width: 120px;
        color: #666;
    }

    code {
        background: #f4f4f4;
        padding: 2px 4px;
        border-radius: 2px;
        font-family: monospace;
        font-size: 12px;
    }

    pre {
        background: #f4f4f4;
        padding: 10px;
        border-radius: 4px;
        overflow-x: auto;
        font-size: 11px;
        margin: 5px 0 0 0;
    }

    .no-data {
        text-align: center;
        padding: 40px 20px;
        color: #999;
    }
</style>
