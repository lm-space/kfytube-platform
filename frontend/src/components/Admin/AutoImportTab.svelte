<script lang="ts">
    import { onMount } from "svelte";
    import { API_BASE, token, categories } from "../../lib/stores";

    // Tabs within Auto Import
    let activeSubTab: 'channels' | 'queue' | 'rules' | 'discover' = 'channels';

    // Channels data
    let channels: any[] = [];
    let loadingChannels = true;

    // Queue data
    let queueVideos: any[] = [];
    let queueTotal = 0;
    let queueStatus = 'pending';
    let loadingQueue = true;

    // Rules data
    let rules: any[] = [];
    let loadingRules = true;

    // Stats
    let stats: any = null;

    // Add channel modal
    let showAddChannel = false;
    let channelInput = '';
    let resolvedChannel: any = null;
    let resolvingChannel = false;
    let newChannelCategoryId: number | null = null;
    let newChannelImportMode = 'queue';
    let newChannelMinViews = 0;

    // Add rule modal
    let showAddRule = false;
    let newRuleName = '';
    let newRulePattern = '';
    let newRulePatternType = 'contains';
    let newRuleCategoryId: number | null = null;
    let newRulePriority = 0;

    // Selection for bulk actions
    let selectedVideos: Set<number> = new Set();
    let selectAll = false;

    // YouTube API status
    let youtubeApiStatus: any = null;
    let runningDiscovery = false;
    let discoveryResult: any = null;

    // Content Discovery
    let searchQuery = '';
    let searchResults: any[] = [];
    let searchingYouTube = false;
    let suggestedChannels: any[] = [];
    let loadingSuggested = false;
    let importingExisting = false;
    let importExistingResult: any = null;

    // Video from URL discovery
    let videoUrlInput = '';
    let discoveredChannel: any = null;
    let discoveringChannel = false;

    onMount(async () => {
        await Promise.all([
            loadChannels(),
            loadStats(),
            loadYouTubeApiStatus()
        ]);
    });

    async function loadYouTubeApiStatus() {
        try {
            const res = await fetch(`${API_BASE}/auto-import/youtube-api-status`, {
                headers: { Authorization: `Bearer ${$token}` }
            });
            if (res.ok) youtubeApiStatus = await res.json();
        } catch (e) {
            console.error('Failed to load YouTube API status', e);
        }
    }

    async function runDiscoveryNow() {
        runningDiscovery = true;
        discoveryResult = null;
        try {
            const res = await fetch(`${API_BASE}/auto-import/run-discovery`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${$token}` }
            });
            if (res.ok) {
                discoveryResult = await res.json();
                await loadStats();
                if (activeSubTab === 'queue') await loadQueue();
            } else {
                const err = await res.json();
                discoveryResult = { error: err.error || 'Discovery failed' };
            }
        } catch (e) {
            discoveryResult = { error: 'Discovery request failed' };
        }
        runningDiscovery = false;
    }

    async function loadChannels() {
        loadingChannels = true;
        try {
            const res = await fetch(`${API_BASE}/auto-import/channels`, {
                headers: { Authorization: `Bearer ${$token}` }
            });
            if (res.ok) channels = await res.json();
        } catch (e) {
            console.error('Failed to load channels', e);
        }
        loadingChannels = false;
    }

    async function loadQueue() {
        loadingQueue = true;
        try {
            const res = await fetch(`${API_BASE}/auto-import/queue?status=${queueStatus}&limit=100`, {
                headers: { Authorization: `Bearer ${$token}` }
            });
            if (res.ok) {
                const data = await res.json();
                queueVideos = data.items;
                queueTotal = data.total;
            }
        } catch (e) {
            console.error('Failed to load queue', e);
        }
        loadingQueue = false;
        selectedVideos = new Set();
        selectAll = false;
    }

    async function loadRules() {
        loadingRules = true;
        try {
            const res = await fetch(`${API_BASE}/auto-import/rules`, {
                headers: { Authorization: `Bearer ${$token}` }
            });
            if (res.ok) rules = await res.json();
        } catch (e) {
            console.error('Failed to load rules', e);
        }
        loadingRules = false;
    }

    async function loadStats() {
        try {
            const res = await fetch(`${API_BASE}/auto-import/stats`, {
                headers: { Authorization: `Bearer ${$token}` }
            });
            if (res.ok) stats = await res.json();
        } catch (e) {
            console.error('Failed to load stats', e);
        }
    }

    function switchSubTab(tab: 'channels' | 'queue' | 'rules' | 'discover') {
        activeSubTab = tab;
        if (tab === 'channels' && channels.length === 0) loadChannels();
        if (tab === 'queue') loadQueue();
        if (tab === 'rules' && rules.length === 0) loadRules();
        if (tab === 'discover' && suggestedChannels.length === 0) loadSuggestedChannels();
    }

    // Resolve channel from URL/handle
    async function resolveChannel() {
        if (!channelInput.trim()) return;
        resolvingChannel = true;
        resolvedChannel = null;

        try {
            const res = await fetch(`${API_BASE}/auto-import/resolve-channel?input=${encodeURIComponent(channelInput)}`, {
                headers: { Authorization: `Bearer ${$token}` }
            });
            if (res.ok) {
                resolvedChannel = await res.json();
            } else {
                const err = await res.json();
                alert(err.error || 'Could not resolve channel');
            }
        } catch (e) {
            alert('Failed to resolve channel');
        }
        resolvingChannel = false;
    }

    // Add channel
    async function addChannel() {
        if (!resolvedChannel) return;

        try {
            const res = await fetch(`${API_BASE}/auto-import/channels`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${$token}`
                },
                body: JSON.stringify({
                    channel_id: resolvedChannel.channel_id,
                    channel_name: resolvedChannel.channel_name,
                    channel_handle: resolvedChannel.channel_handle,
                    default_category_id: newChannelCategoryId,
                    import_mode: newChannelImportMode,
                    min_views: newChannelMinViews
                })
            });

            if (res.ok) {
                showAddChannel = false;
                channelInput = '';
                resolvedChannel = null;
                newChannelCategoryId = null;
                newChannelImportMode = 'queue';
                newChannelMinViews = 0;
                await loadChannels();
                await loadStats();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to add channel');
            }
        } catch (e) {
            alert('Failed to add channel');
        }
    }

    // Toggle channel active
    async function toggleChannelActive(channel: any) {
        try {
            await fetch(`${API_BASE}/auto-import/channels/${channel.id}`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${$token}`
                },
                body: JSON.stringify({ is_active: channel.is_active ? 0 : 1 })
            });
            await loadChannels();
        } catch (e) {
            console.error(e);
        }
    }

    // Discover videos from channel
    async function discoverFromChannel(channel: any) {
        try {
            const res = await fetch(`${API_BASE}/auto-import/channels/${channel.id}/discover`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${$token}` }
            });
            if (res.ok) {
                const data = await res.json();
                alert(`Discovered ${data.discovered} new videos (${data.skipped} already exist)`);
                await loadChannels();
                await loadStats();
            } else {
                const err = await res.json();
                alert(err.error || 'Discovery failed');
            }
        } catch (e) {
            alert('Discovery failed');
        }
    }

    // Delete channel
    async function deleteChannel(channel: any) {
        if (!confirm(`Delete channel "${channel.channel_name}"?`)) return;
        try {
            await fetch(`${API_BASE}/auto-import/channels/${channel.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${$token}` }
            });
            await loadChannels();
            await loadStats();
        } catch (e) {
            console.error(e);
        }
    }

    // Toggle video selection
    function toggleVideoSelection(id: number) {
        if (selectedVideos.has(id)) {
            selectedVideos.delete(id);
        } else {
            selectedVideos.add(id);
        }
        selectedVideos = selectedVideos;
        selectAll = selectedVideos.size === queueVideos.length;
    }

    function toggleSelectAll() {
        if (selectAll) {
            selectedVideos = new Set();
        } else {
            selectedVideos = new Set(queueVideos.map(v => v.id));
        }
        selectAll = !selectAll;
    }

    // Bulk approve/reject
    async function bulkAction(action: 'approve' | 'reject', categoryId?: number) {
        if (selectedVideos.size === 0) {
            alert('No videos selected');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auto-import/queue/review`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${$token}`
                },
                body: JSON.stringify({
                    video_ids: Array.from(selectedVideos),
                    action,
                    category_id: categoryId
                })
            });

            if (res.ok) {
                const data = await res.json();
                alert(`${action === 'approve' ? 'Imported' : 'Rejected'} ${data.count || selectedVideos.size} videos`);
                await loadQueue();
                await loadStats();
            }
        } catch (e) {
            alert('Action failed');
        }
    }

    // Add rule
    async function addRule() {
        if (!newRuleName || !newRulePattern || !newRuleCategoryId) {
            alert('Please fill all fields');
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/auto-import/rules`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${$token}`
                },
                body: JSON.stringify({
                    name: newRuleName,
                    pattern: newRulePattern,
                    pattern_type: newRulePatternType,
                    target_category_id: newRuleCategoryId,
                    priority: newRulePriority
                })
            });

            if (res.ok) {
                showAddRule = false;
                newRuleName = '';
                newRulePattern = '';
                newRulePatternType = 'contains';
                newRuleCategoryId = null;
                newRulePriority = 0;
                await loadRules();
            }
        } catch (e) {
            alert('Failed to add rule');
        }
    }

    // Delete rule
    async function deleteRule(rule: any) {
        if (!confirm(`Delete rule "${rule.name}"?`)) return;
        try {
            await fetch(`${API_BASE}/auto-import/rules/${rule.id}`, {
                method: 'DELETE',
                headers: { Authorization: `Bearer ${$token}` }
            });
            await loadRules();
        } catch (e) {
            console.error(e);
        }
    }

    function formatDate(dateStr: string | null): string {
        if (!dateStr) return 'Never';
        return new Date(dateStr).toLocaleString();
    }

    // Import existing channels from playlists
    async function importExistingChannels() {
        importingExisting = true;
        importExistingResult = null;
        try {
            const res = await fetch(`${API_BASE}/auto-import/import-existing-channels`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${$token}` }
            });
            if (res.ok) {
                importExistingResult = await res.json();
                await loadChannels();
                await loadStats();
            } else {
                const err = await res.json();
                importExistingResult = { error: err.error || 'Import failed' };
            }
        } catch (e) {
            importExistingResult = { error: 'Import request failed' };
        }
        importingExisting = false;
    }

    // Load suggested kids channels
    async function loadSuggestedChannels() {
        loadingSuggested = true;
        try {
            const res = await fetch(`${API_BASE}/auto-import/suggested-channels`, {
                headers: { Authorization: `Bearer ${$token}` }
            });
            if (res.ok) {
                const data = await res.json();
                suggestedChannels = data.channels;
            }
        } catch (e) {
            console.error('Failed to load suggested channels', e);
        }
        loadingSuggested = false;
    }

    // Search YouTube for videos
    async function searchYouTube() {
        if (!searchQuery.trim()) return;
        searchingYouTube = true;
        searchResults = [];
        try {
            const res = await fetch(`${API_BASE}/auto-import/search-youtube`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${$token}`
                },
                body: JSON.stringify({
                    query: searchQuery,
                    maxResults: 25,
                    safeSearch: 'strict'
                })
            });
            if (res.ok) {
                const data = await res.json();
                searchResults = data.videos || [];
            } else {
                const err = await res.json();
                alert(err.error || 'Search failed');
            }
        } catch (e) {
            alert('Search request failed');
        }
        searchingYouTube = false;
    }

    // Discover channel from video URL
    async function discoverChannelFromVideo() {
        if (!videoUrlInput.trim()) return;

        // Extract video ID from URL
        let videoId = videoUrlInput.trim();
        const match = videoId.match(/(?:v=|youtu\.be\/|shorts\/)([a-zA-Z0-9_-]{11})/);
        if (match) videoId = match[1];

        discoveringChannel = true;
        discoveredChannel = null;
        try {
            const res = await fetch(`${API_BASE}/auto-import/discover-channel-from-video`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${$token}`
                },
                body: JSON.stringify({ videoId })
            });
            if (res.ok) {
                discoveredChannel = await res.json();
            } else {
                const err = await res.json();
                alert(err.error || 'Could not find video');
            }
        } catch (e) {
            alert('Request failed');
        }
        discoveringChannel = false;
    }

    // Quick add channel from suggested/discovered
    async function quickAddChannel(channelId: string, channelName: string) {
        try {
            const res = await fetch(`${API_BASE}/auto-import/channels`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${$token}`
                },
                body: JSON.stringify({
                    channel_id: channelId,
                    channel_name: channelName,
                    import_mode: 'queue',
                    min_views: 0
                })
            });
            if (res.ok) {
                await loadSuggestedChannels();
                await loadChannels();
                await loadStats();
                // Update discovered channel status if applicable
                if (discoveredChannel?.channelId === channelId) {
                    discoveredChannel = { ...discoveredChannel, isTracked: true };
                }
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to add channel');
            }
        } catch (e) {
            alert('Failed to add channel');
        }
    }

    // Add search result videos to queue
    async function addSearchResultsToQueue(videos: any[], categoryId?: number) {
        try {
            const res = await fetch(`${API_BASE}/auto-import/queue-from-search`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${$token}`
                },
                body: JSON.stringify({
                    videos: videos.map(v => ({
                        id: v.id,
                        title: v.title,
                        thumbnailUrl: v.thumbnailUrl,
                        duration: v.duration,
                        viewCount: v.viewCount,
                        likeCount: v.likeCount,
                        publishedAt: v.publishedAt,
                        madeForKids: v.madeForKids,
                        isShort: v.isShort
                    })),
                    suggested_category_id: categoryId
                })
            });
            if (res.ok) {
                const data = await res.json();
                alert(data.message);
                await loadStats();
            } else {
                const err = await res.json();
                alert(err.error || 'Failed to add to queue');
            }
        } catch (e) {
            alert('Request failed');
        }
    }
</script>

<div class="auto-import-tab">
    <div class="tab-header">
        <h2>Auto Import</h2>
        <div class="header-actions">
            {#if stats}
                <div class="stats-bar">
                    <span class="stat"><strong>{stats.pending}</strong> pending</span>
                    <span class="stat"><strong>{stats.imported}</strong> imported</span>
                    <span class="stat"><strong>{stats.active_channels}</strong> channels</span>
                </div>
            {/if}
            <button
                class="btn btn-secondary"
                on:click={runDiscoveryNow}
                disabled={runningDiscovery}
            >
                {runningDiscovery ? '⏳ Running...' : '🔄 Run Discovery Now'}
            </button>
        </div>
    </div>

    <!-- YouTube API Status Banner -->
    {#if youtubeApiStatus}
        <div class="api-status-banner" class:enabled={youtubeApiStatus.enabled}>
            <div class="api-status-icon">
                {youtubeApiStatus.enabled ? '✅' : 'ℹ️'}
            </div>
            <div class="api-status-info">
                <strong>{youtubeApiStatus.enabled ? 'YouTube API Enabled' : 'Using RSS Feeds'}</strong>
                <p>{youtubeApiStatus.message}</p>
                <div class="features">
                    {#each youtubeApiStatus.features as feature}
                        <span class="feature-badge">{feature}</span>
                    {/each}
                </div>
            </div>
        </div>
    {/if}

    <!-- Discovery Result -->
    {#if discoveryResult}
        <div class="discovery-result" class:error={discoveryResult.error}>
            {#if discoveryResult.error}
                <span>❌ {discoveryResult.error}</span>
            {:else}
                <span>✅ Discovered {discoveryResult.discovered} videos from {discoveryResult.channels} channels</span>
                {#if discoveryResult.skippedMadeForKids > 0}
                    <span class="skip-info">(Skipped {discoveryResult.skippedMadeForKids} non-kids videos)</span>
                {/if}
            {/if}
            <button class="close-btn" on:click={() => discoveryResult = null}>×</button>
        </div>
    {/if}

    <!-- Sub-tabs -->
    <div class="sub-tabs">
        <button class:active={activeSubTab === 'channels'} on:click={() => switchSubTab('channels')}>
            Channels
        </button>
        <button class:active={activeSubTab === 'queue'} on:click={() => switchSubTab('queue')}>
            Video Queue {#if stats?.pending > 0}<span class="badge">{stats.pending}</span>{/if}
        </button>
        <button class:active={activeSubTab === 'rules'} on:click={() => switchSubTab('rules')}>
            Import Rules
        </button>
        <button class:active={activeSubTab === 'discover'} on:click={() => switchSubTab('discover')}>
            Discover
        </button>
    </div>

    <!-- Channels Tab -->
    {#if activeSubTab === 'channels'}
        <div class="section">
            <div class="section-header">
                <h3>Tracked Channels</h3>
                <button class="btn btn-primary" on:click={() => showAddChannel = true}>
                    + Add Channel
                </button>
            </div>

            {#if loadingChannels}
                <div class="loading">Loading channels...</div>
            {:else if channels.length === 0}
                <div class="empty-state">
                    <p>No channels tracked yet. Add a YouTube channel to start auto-importing videos.</p>
                </div>
            {:else}
                <div class="channels-grid">
                    {#each channels as channel}
                        <div class="channel-card" class:inactive={!channel.is_active}>
                            <div class="channel-header">
                                <div class="channel-info">
                                    <h4>{channel.channel_name}</h4>
                                    {#if channel.channel_handle}
                                        <span class="handle">{channel.channel_handle}</span>
                                    {/if}
                                </div>
                                <div class="channel-badges">
                                    {#if channel.category_name}
                                        <span class="badge category">{channel.category_name}</span>
                                    {/if}
                                    <span class="badge mode" class:auto={channel.import_mode === 'auto'}>
                                        {channel.import_mode === 'auto' ? 'Auto' : 'Queue'}
                                    </span>
                                </div>
                            </div>
                            <div class="channel-stats">
                                <span>Videos: {channel.video_count}</span>
                                <span>Last sync: {formatDate(channel.last_synced)}</span>
                            </div>
                            <div class="channel-actions">
                                <button class="btn btn-sm" on:click={() => discoverFromChannel(channel)}>
                                    Discover
                                </button>
                                <button class="btn btn-sm" on:click={() => toggleChannelActive(channel)}>
                                    {channel.is_active ? 'Disable' : 'Enable'}
                                </button>
                                <button class="btn btn-sm btn-danger" on:click={() => deleteChannel(channel)}>
                                    Delete
                                </button>
                            </div>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>
    {/if}

    <!-- Queue Tab -->
    {#if activeSubTab === 'queue'}
        <div class="section">
            <div class="section-header">
                <h3>Video Queue</h3>
                <div class="queue-filters">
                    <select bind:value={queueStatus} on:change={loadQueue}>
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                        <option value="imported">Imported</option>
                    </select>
                    {#if selectedVideos.size > 0}
                        <button class="btn btn-success" on:click={() => bulkAction('approve')}>
                            Approve ({selectedVideos.size})
                        </button>
                        <button class="btn btn-danger" on:click={() => bulkAction('reject')}>
                            Reject ({selectedVideos.size})
                        </button>
                    {/if}
                </div>
            </div>

            {#if loadingQueue}
                <div class="loading">Loading queue...</div>
            {:else if queueVideos.length === 0}
                <div class="empty-state">
                    <p>No videos in {queueStatus} queue.</p>
                </div>
            {:else}
                <div class="queue-list">
                    <div class="queue-header">
                        <label class="checkbox-cell">
                            <input type="checkbox" checked={selectAll} on:change={toggleSelectAll} />
                        </label>
                        <span class="col-thumb">Thumbnail</span>
                        <span class="col-title">Title</span>
                        <span class="col-channel">Channel</span>
                        <span class="col-category">Category</span>
                        <span class="col-views">Views</span>
                    </div>
                    {#each queueVideos as video}
                        <div class="queue-item" class:selected={selectedVideos.has(video.id)}>
                            <label class="checkbox-cell">
                                <input
                                    type="checkbox"
                                    checked={selectedVideos.has(video.id)}
                                    on:change={() => toggleVideoSelection(video.id)}
                                />
                            </label>
                            <div class="col-thumb">
                                <img src={video.thumbnail_url} alt={video.title} />
                                {#if video.is_short}<span class="short-badge">Short</span>{/if}
                            </div>
                            <div class="col-title">
                                <a href={`https://youtube.com/watch?v=${video.youtube_video_id}`} target="_blank">
                                    {video.title}
                                </a>
                            </div>
                            <div class="col-channel">{video.channel_name || 'Unknown'}</div>
                            <div class="col-category">{video.category_name || '-'}</div>
                            <div class="col-views">{video.view_count?.toLocaleString() || '-'}</div>
                        </div>
                    {/each}
                </div>
                <div class="queue-footer">
                    Showing {queueVideos.length} of {queueTotal} videos
                </div>
            {/if}
        </div>
    {/if}

    <!-- Rules Tab -->
    {#if activeSubTab === 'rules'}
        <div class="section">
            <div class="section-header">
                <h3>Import Rules</h3>
                <button class="btn btn-primary" on:click={() => showAddRule = true}>
                    + Add Rule
                </button>
            </div>

            <p class="help-text">
                Rules automatically categorize videos based on their title when discovered.
                Higher priority rules are checked first.
            </p>

            {#if loadingRules}
                <div class="loading">Loading rules...</div>
            {:else if rules.length === 0}
                <div class="empty-state">
                    <p>No import rules defined. Add rules to auto-categorize videos.</p>
                </div>
            {:else}
                <table class="rules-table">
                    <thead>
                        <tr>
                            <th>Name</th>
                            <th>Pattern</th>
                            <th>Type</th>
                            <th>Category</th>
                            <th>Priority</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        {#each rules as rule}
                            <tr class:inactive={!rule.is_active}>
                                <td>{rule.name}</td>
                                <td><code>{rule.pattern}</code></td>
                                <td>{rule.pattern_type}</td>
                                <td>{rule.category_name}</td>
                                <td>{rule.priority}</td>
                                <td>
                                    <button class="btn btn-sm btn-danger" on:click={() => deleteRule(rule)}>
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        {/each}
                    </tbody>
                </table>
            {/if}
        </div>
    {/if}

    <!-- Discover Tab -->
    {#if activeSubTab === 'discover'}
        <div class="section discover-section">
            <h3>Content Discovery Tools</h3>
            <p class="help-text">Find new channels and videos to add to your library.</p>

            <!-- Import Existing Channels -->
            <div class="discover-card">
                <div class="discover-card-header">
                    <h4>Import Existing Channels</h4>
                    <span class="card-badge">Quick Start</span>
                </div>
                <p>Import all YouTube channels from your existing playlists into the auto-import tracking system.</p>
                <button
                    class="btn btn-primary"
                    on:click={importExistingChannels}
                    disabled={importingExisting}
                >
                    {importingExisting ? 'Importing...' : 'Import From Playlists'}
                </button>
                {#if importExistingResult}
                    <div class="result-message" class:error={importExistingResult.error}>
                        {#if importExistingResult.error}
                            {importExistingResult.error}
                        {:else}
                            {importExistingResult.message}
                        {/if}
                    </div>
                {/if}
            </div>

            <!-- YouTube Search -->
            {#if youtubeApiStatus?.enabled}
                <div class="discover-card">
                    <div class="discover-card-header">
                        <h4>Search YouTube</h4>
                        <span class="card-badge">API</span>
                    </div>
                    <p>Search for kid-friendly videos using YouTube's API with strict safe search.</p>
                    <div class="search-row">
                        <input
                            type="text"
                            bind:value={searchQuery}
                            placeholder="e.g., kids learning videos, alphabet songs..."
                            on:keydown={(e) => e.key === 'Enter' && searchYouTube()}
                        />
                        <button
                            class="btn btn-primary"
                            on:click={searchYouTube}
                            disabled={searchingYouTube}
                        >
                            {searchingYouTube ? 'Searching...' : 'Search'}
                        </button>
                    </div>

                    {#if searchResults.length > 0}
                        <div class="search-results">
                            <div class="search-results-header">
                                <span>Found {searchResults.length} videos</span>
                                <button
                                    class="btn btn-sm btn-success"
                                    on:click={() => addSearchResultsToQueue(searchResults.filter(v => v.madeForKids))}
                                >
                                    Add Kids Videos to Queue ({searchResults.filter(v => v.madeForKids).length})
                                </button>
                            </div>
                            <div class="search-results-grid">
                                {#each searchResults as video}
                                    <div class="search-result-item" class:made-for-kids={video.madeForKids}>
                                        <img src={video.thumbnailUrl} alt={video.title} />
                                        <div class="search-result-info">
                                            <h5>{video.title}</h5>
                                            <div class="search-result-meta">
                                                <span>{video.viewCount?.toLocaleString() || 0} views</span>
                                                {#if video.madeForKids}
                                                    <span class="kids-badge">Made for Kids</span>
                                                {/if}
                                                {#if video.isShort}
                                                    <span class="short-badge">Short</span>
                                                {/if}
                                            </div>
                                        </div>
                                    </div>
                                {/each}
                            </div>
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Discover Channel from Video -->
            {#if youtubeApiStatus?.enabled}
                <div class="discover-card">
                    <div class="discover-card-header">
                        <h4>Find Channel from Video</h4>
                        <span class="card-badge">API</span>
                    </div>
                    <p>Paste a YouTube video URL to discover and add its channel.</p>
                    <div class="search-row">
                        <input
                            type="text"
                            bind:value={videoUrlInput}
                            placeholder="https://youtube.com/watch?v=..."
                            on:keydown={(e) => e.key === 'Enter' && discoverChannelFromVideo()}
                        />
                        <button
                            class="btn btn-primary"
                            on:click={discoverChannelFromVideo}
                            disabled={discoveringChannel}
                        >
                            {discoveringChannel ? 'Finding...' : 'Find Channel'}
                        </button>
                    </div>

                    {#if discoveredChannel}
                        <div class="discovered-channel">
                            {#if discoveredChannel.thumbnailUrl}
                                <img src={discoveredChannel.thumbnailUrl} alt={discoveredChannel.channelName} class="channel-thumb" />
                            {/if}
                            <div class="discovered-channel-info">
                                <h5>{discoveredChannel.channelName}</h5>
                                <p class="channel-id">{discoveredChannel.channelId}</p>
                                {#if discoveredChannel.madeForKids}
                                    <span class="kids-badge">Video is Made for Kids</span>
                                {/if}
                            </div>
                            <div class="discovered-channel-actions">
                                {#if discoveredChannel.isTracked}
                                    <span class="tracked-badge">Already Tracked</span>
                                {:else}
                                    <button
                                        class="btn btn-success"
                                        on:click={() => quickAddChannel(discoveredChannel.channelId, discoveredChannel.channelName)}
                                    >
                                        + Add Channel
                                    </button>
                                {/if}
                            </div>
                        </div>
                    {/if}
                </div>
            {/if}

            <!-- Suggested Channels -->
            <div class="discover-card">
                <div class="discover-card-header">
                    <h4>Suggested Kids Channels</h4>
                    <span class="card-badge">Curated</span>
                </div>
                <p>Popular, trusted educational channels for children.</p>

                {#if loadingSuggested}
                    <div class="loading">Loading suggestions...</div>
                {:else if suggestedChannels.length > 0}
                    <div class="suggested-channels-grid">
                        {#each suggestedChannels as channel}
                            <div class="suggested-channel" class:tracked={channel.isTracked}>
                                <div class="suggested-channel-info">
                                    <h5>{channel.name}</h5>
                                    <span class="category-tag">{channel.category}</span>
                                </div>
                                {#if channel.isTracked}
                                    <span class="tracked-badge">Tracked</span>
                                {:else}
                                    <button
                                        class="btn btn-sm btn-success"
                                        on:click={() => quickAddChannel(channel.id, channel.name)}
                                    >
                                        + Add
                                    </button>
                                {/if}
                            </div>
                        {/each}
                    </div>
                {:else}
                    <button class="btn" on:click={loadSuggestedChannels}>Load Suggestions</button>
                {/if}
            </div>
        </div>
    {/if}
</div>

<!-- Add Channel Modal -->
{#if showAddChannel}
    <div class="modal-overlay" on:click={() => showAddChannel = false}>
        <div class="modal" on:click|stopPropagation>
            <h3>Add YouTube Channel</h3>

            <div class="form-group">
                <label>Channel URL, Handle, or ID</label>
                <div class="input-row">
                    <input
                        type="text"
                        bind:value={channelInput}
                        placeholder="@ChannelHandle or https://youtube.com/@channel"
                        on:keydown={(e) => e.key === 'Enter' && resolveChannel()}
                    />
                    <button class="btn" on:click={resolveChannel} disabled={resolvingChannel}>
                        {resolvingChannel ? 'Resolving...' : 'Resolve'}
                    </button>
                </div>
            </div>

            {#if resolvedChannel}
                <div class="resolved-channel">
                    <h4>{resolvedChannel.channel_name}</h4>
                    {#if resolvedChannel.channel_handle}
                        <p>{resolvedChannel.channel_handle}</p>
                    {/if}
                    <p class="channel-id">ID: {resolvedChannel.channel_id}</p>
                </div>

                <div class="form-group">
                    <label>Default Category</label>
                    <select bind:value={newChannelCategoryId}>
                        <option value={null}>-- None --</option>
                        {#each $categories as cat}
                            <option value={cat.id}>{cat.name}</option>
                        {/each}
                    </select>
                </div>

                <div class="form-group">
                    <label>Import Mode</label>
                    <select bind:value={newChannelImportMode}>
                        <option value="queue">Queue for Review</option>
                        <option value="auto">Auto-Import</option>
                    </select>
                </div>

                {#if newChannelImportMode === 'auto'}
                    <div class="form-group">
                        <label>Minimum Views for Auto-Import</label>
                        <input type="number" bind:value={newChannelMinViews} min="0" />
                    </div>
                {/if}

                <div class="modal-actions">
                    <button class="btn" on:click={() => showAddChannel = false}>Cancel</button>
                    <button class="btn btn-primary" on:click={addChannel}>Add Channel</button>
                </div>
            {/if}
        </div>
    </div>
{/if}

<!-- Add Rule Modal -->
{#if showAddRule}
    <div class="modal-overlay" on:click={() => showAddRule = false}>
        <div class="modal" on:click|stopPropagation>
            <h3>Add Import Rule</h3>

            <div class="form-group">
                <label>Rule Name</label>
                <input type="text" bind:value={newRuleName} placeholder="e.g., God/Religious videos" />
            </div>

            <div class="form-group">
                <label>Pattern</label>
                <input type="text" bind:value={newRulePattern} placeholder="e.g., devotional, bhajan, god" />
            </div>

            <div class="form-group">
                <label>Pattern Type</label>
                <select bind:value={newRulePatternType}>
                    <option value="contains">Contains</option>
                    <option value="starts_with">Starts With</option>
                    <option value="regex">Regex</option>
                </select>
            </div>

            <div class="form-group">
                <label>Target Category</label>
                <select bind:value={newRuleCategoryId}>
                    <option value={null}>-- Select --</option>
                    {#each $categories as cat}
                        <option value={cat.id}>{cat.name}</option>
                    {/each}
                </select>
            </div>

            <div class="form-group">
                <label>Priority (higher = checked first)</label>
                <input type="number" bind:value={newRulePriority} />
            </div>

            <div class="modal-actions">
                <button class="btn" on:click={() => showAddRule = false}>Cancel</button>
                <button class="btn btn-primary" on:click={addRule}>Add Rule</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .auto-import-tab {
        padding: 20px;
    }

    .tab-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
    }

    .tab-header h2 {
        margin: 0;
    }

    .header-actions {
        display: flex;
        align-items: center;
        gap: 20px;
    }

    .stats-bar {
        display: flex;
        gap: 20px;
    }

    .stat {
        color: var(--admin-text-light);
    }

    .stat strong {
        color: var(--admin-primary);
    }

    /* YouTube API Status Banner */
    .api-status-banner {
        display: flex;
        gap: 12px;
        padding: 12px 16px;
        background: var(--admin-surface);
        border: 1px solid var(--admin-border);
        border-radius: 8px;
        margin-bottom: 16px;
    }

    .api-status-banner.enabled {
        background: rgba(34, 197, 94, 0.1);
        border-color: rgba(34, 197, 94, 0.3);
    }

    .api-status-icon {
        font-size: 24px;
    }

    .api-status-info {
        flex: 1;
    }

    .api-status-info strong {
        display: block;
        margin-bottom: 4px;
    }

    .api-status-info p {
        margin: 0 0 8px 0;
        color: var(--admin-text-light);
        font-size: 13px;
    }

    .features {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
    }

    .feature-badge {
        background: var(--admin-bg);
        padding: 2px 8px;
        border-radius: 4px;
        font-size: 11px;
        color: var(--admin-text-light);
    }

    /* Discovery Result */
    .discovery-result {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        border-radius: 8px;
        margin-bottom: 16px;
    }

    .discovery-result.error {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
    }

    .discovery-result .skip-info {
        color: var(--admin-text-light);
        font-size: 13px;
    }

    .discovery-result .close-btn {
        margin-left: auto;
        background: none;
        border: none;
        font-size: 18px;
        cursor: pointer;
        color: var(--admin-text-light);
        padding: 0 4px;
    }

    .discovery-result .close-btn:hover {
        color: var(--admin-text);
    }

    /* Sub-tabs */
    .sub-tabs {
        display: flex;
        gap: 4px;
        margin-bottom: 20px;
        border-bottom: 1px solid var(--admin-border);
        padding-bottom: 0;
    }

    .sub-tabs button {
        background: none;
        border: none;
        padding: 12px 20px;
        color: var(--admin-text-light);
        cursor: pointer;
        border-bottom: 2px solid transparent;
        margin-bottom: -1px;
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .sub-tabs button:hover {
        color: var(--admin-text);
    }

    .sub-tabs button.active {
        color: var(--admin-primary);
        border-bottom-color: var(--admin-primary);
    }

    .badge {
        background: var(--admin-primary);
        color: white;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 10px;
    }

    /* Section */
    .section {
        background: var(--admin-card);
        border-radius: 8px;
        padding: 20px;
    }

    .section-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 16px;
    }

    .section-header h3 {
        margin: 0;
    }

    /* Channels Grid */
    .channels-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 16px;
    }

    .channel-card {
        background: var(--admin-bg);
        border: 1px solid var(--admin-border);
        border-radius: 8px;
        padding: 16px;
    }

    .channel-card.inactive {
        opacity: 0.6;
    }

    .channel-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 12px;
    }

    .channel-info h4 {
        margin: 0 0 4px;
    }

    .channel-info .handle {
        color: var(--admin-text-light);
        font-size: 13px;
    }

    .channel-badges {
        display: flex;
        gap: 6px;
    }

    .channel-badges .badge {
        font-size: 10px;
        padding: 2px 6px;
    }

    .channel-badges .badge.category {
        background: #4a5568;
    }

    .channel-badges .badge.mode {
        background: #718096;
    }

    .channel-badges .badge.mode.auto {
        background: #48bb78;
    }

    .channel-stats {
        display: flex;
        gap: 16px;
        font-size: 13px;
        color: var(--admin-text-light);
        margin-bottom: 12px;
    }

    .channel-actions {
        display: flex;
        gap: 8px;
    }

    /* Queue List */
    .queue-filters {
        display: flex;
        gap: 12px;
        align-items: center;
    }

    .queue-list {
        border: 1px solid var(--admin-border);
        border-radius: 8px;
        overflow: hidden;
    }

    .queue-header {
        display: grid;
        grid-template-columns: 40px 100px 1fr 150px 100px 80px;
        gap: 12px;
        padding: 12px;
        background: var(--admin-bg);
        font-weight: 600;
        font-size: 13px;
        border-bottom: 1px solid var(--admin-border);
    }

    .queue-item {
        display: grid;
        grid-template-columns: 40px 100px 1fr 150px 100px 80px;
        gap: 12px;
        padding: 12px;
        border-bottom: 1px solid var(--admin-border);
        align-items: center;
    }

    .queue-item:last-child {
        border-bottom: none;
    }

    .queue-item.selected {
        background: rgba(66, 153, 225, 0.1);
    }

    .checkbox-cell {
        display: flex;
        align-items: center;
        justify-content: center;
    }

    .col-thumb {
        position: relative;
    }

    .col-thumb img {
        width: 100px;
        height: 56px;
        object-fit: cover;
        border-radius: 4px;
    }

    .short-badge {
        position: absolute;
        bottom: 4px;
        right: 4px;
        background: #ff0050;
        color: white;
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 2px;
    }

    .col-title {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .col-title a {
        color: var(--admin-text);
        text-decoration: none;
    }

    .col-title a:hover {
        color: var(--admin-primary);
    }

    .queue-footer {
        padding: 12px;
        text-align: center;
        color: var(--admin-text-light);
        font-size: 13px;
    }

    /* Rules Table */
    .rules-table {
        width: 100%;
        border-collapse: collapse;
    }

    .rules-table th,
    .rules-table td {
        padding: 12px;
        text-align: left;
        border-bottom: 1px solid var(--admin-border);
    }

    .rules-table th {
        background: var(--admin-bg);
        font-weight: 600;
    }

    .rules-table code {
        background: var(--admin-bg);
        padding: 2px 6px;
        border-radius: 4px;
        font-family: monospace;
    }

    .rules-table tr.inactive {
        opacity: 0.5;
    }

    .help-text {
        color: var(--admin-text-light);
        font-size: 14px;
        margin-bottom: 16px;
    }

    /* Modal */
    .modal-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: var(--admin-card);
        border-radius: 12px;
        padding: 24px;
        width: 90%;
        max-width: 500px;
        max-height: 90vh;
        overflow-y: auto;
    }

    .modal h3 {
        margin: 0 0 20px;
    }

    .form-group {
        margin-bottom: 16px;
    }

    .form-group label {
        display: block;
        margin-bottom: 6px;
        font-weight: 500;
    }

    .form-group input,
    .form-group select {
        width: 100%;
        padding: 10px;
        border: 1px solid var(--admin-border);
        border-radius: 6px;
        background: var(--admin-bg);
        color: var(--admin-text);
    }

    .input-row {
        display: flex;
        gap: 8px;
    }

    .input-row input {
        flex: 1;
    }

    .resolved-channel {
        background: var(--admin-bg);
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 16px;
    }

    .resolved-channel h4 {
        margin: 0 0 4px;
    }

    .resolved-channel p {
        margin: 0;
        color: var(--admin-text-light);
        font-size: 13px;
    }

    .resolved-channel .channel-id {
        font-family: monospace;
        font-size: 11px;
        margin-top: 8px;
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 20px;
    }

    /* Buttons */
    .btn {
        padding: 8px 16px;
        border: none;
        border-radius: 6px;
        cursor: pointer;
        font-size: 14px;
        background: var(--admin-border);
        color: var(--admin-text);
    }

    .btn:hover {
        background: var(--admin-text-light);
    }

    .btn-primary {
        background: var(--admin-primary);
        color: white;
    }

    .btn-primary:hover {
        background: #3182ce;
    }

    .btn-success {
        background: #48bb78;
        color: white;
    }

    .btn-danger {
        background: #e53e3e;
        color: white;
    }

    .btn-sm {
        padding: 4px 10px;
        font-size: 12px;
    }

    .loading, .empty-state {
        text-align: center;
        padding: 40px;
        color: var(--admin-text-light);
    }

    /* Discover Tab */
    .discover-section {
        display: flex;
        flex-direction: column;
        gap: 20px;
    }

    .discover-card {
        background: var(--admin-bg);
        border: 1px solid var(--admin-border);
        border-radius: 8px;
        padding: 20px;
    }

    .discover-card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
    }

    .discover-card-header h4 {
        margin: 0;
    }

    .card-badge {
        background: var(--admin-primary);
        color: white;
        font-size: 10px;
        padding: 3px 8px;
        border-radius: 4px;
        text-transform: uppercase;
    }

    .discover-card p {
        color: var(--admin-text-light);
        margin: 0 0 16px;
        font-size: 14px;
    }

    .search-row {
        display: flex;
        gap: 10px;
    }

    .search-row input {
        flex: 1;
        padding: 10px 14px;
        border: 1px solid var(--admin-border);
        border-radius: 6px;
        background: var(--admin-card);
        color: var(--admin-text);
        font-size: 14px;
    }

    .result-message {
        margin-top: 12px;
        padding: 10px 14px;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        border-radius: 6px;
        color: #22c55e;
    }

    .result-message.error {
        background: rgba(239, 68, 68, 0.1);
        border-color: rgba(239, 68, 68, 0.3);
        color: #ef4444;
    }

    /* Search Results */
    .search-results {
        margin-top: 16px;
    }

    .search-results-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
        padding-bottom: 12px;
        border-bottom: 1px solid var(--admin-border);
    }

    .search-results-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 12px;
        max-height: 400px;
        overflow-y: auto;
    }

    .search-result-item {
        display: flex;
        gap: 12px;
        padding: 10px;
        background: var(--admin-card);
        border-radius: 6px;
        border: 1px solid var(--admin-border);
    }

    .search-result-item.made-for-kids {
        border-color: rgba(34, 197, 94, 0.5);
    }

    .search-result-item img {
        width: 100px;
        height: 56px;
        object-fit: cover;
        border-radius: 4px;
        flex-shrink: 0;
    }

    .search-result-info {
        flex: 1;
        min-width: 0;
    }

    .search-result-info h5 {
        margin: 0 0 6px;
        font-size: 13px;
        line-height: 1.3;
        overflow: hidden;
        text-overflow: ellipsis;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
    }

    .search-result-meta {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        font-size: 11px;
        color: var(--admin-text-light);
    }

    .kids-badge {
        background: #22c55e;
        color: white;
        padding: 1px 6px;
        border-radius: 3px;
    }

    .short-badge {
        background: #ff0050;
        color: white;
        padding: 1px 6px;
        border-radius: 3px;
    }

    /* Discovered Channel */
    .discovered-channel {
        display: flex;
        align-items: center;
        gap: 16px;
        margin-top: 16px;
        padding: 16px;
        background: var(--admin-card);
        border-radius: 8px;
        border: 1px solid var(--admin-border);
    }

    .channel-thumb {
        width: 60px;
        height: 60px;
        border-radius: 50%;
        object-fit: cover;
    }

    .discovered-channel-info {
        flex: 1;
    }

    .discovered-channel-info h5 {
        margin: 0 0 4px;
    }

    .discovered-channel-info .channel-id {
        margin: 0;
        font-size: 12px;
        color: var(--admin-text-light);
        font-family: monospace;
    }

    .tracked-badge {
        background: #4a5568;
        color: white;
        padding: 4px 10px;
        border-radius: 4px;
        font-size: 12px;
    }

    /* Suggested Channels */
    .suggested-channels-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 10px;
        max-height: 350px;
        overflow-y: auto;
    }

    .suggested-channel {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 12px 14px;
        background: var(--admin-card);
        border-radius: 6px;
        border: 1px solid var(--admin-border);
    }

    .suggested-channel.tracked {
        opacity: 0.7;
    }

    .suggested-channel-info h5 {
        margin: 0 0 4px;
        font-size: 13px;
    }

    .category-tag {
        font-size: 11px;
        color: var(--admin-text-light);
        background: var(--admin-bg);
        padding: 2px 6px;
        border-radius: 3px;
    }

    .btn-secondary {
        background: var(--admin-surface);
        border: 1px solid var(--admin-border);
    }

    .btn-secondary:hover {
        background: var(--admin-border);
    }

    /* Responsive */
    @media (max-width: 768px) {
        .queue-header,
        .queue-item {
            grid-template-columns: 30px 80px 1fr;
        }

        .col-channel,
        .col-category,
        .col-views {
            display: none;
        }

        .channels-grid {
            grid-template-columns: 1fr;
        }

        .search-results-grid,
        .suggested-channels-grid {
            grid-template-columns: 1fr;
        }

        .search-row {
            flex-direction: column;
        }
    }
</style>
