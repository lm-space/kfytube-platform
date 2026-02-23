<script lang="ts">
    import { onMount } from "svelte";
    import { API_BASE, token, getApiHeaders } from "../../lib/stores";

    let tenants: any[] = [];
    let loading = true;
    let showCreateModal = false;
    let showInviteModal = false;
    let showEditModal = false;
    let selectedTenant: any = null;
    let tenantUsers: any[] = [];

    // Form fields
    let newSlug = "";
    let newName = "";
    let newDescription = "";

    // Edit fields
    let editSlug = "";
    let editName = "";
    let editDescription = "";

    // Invite fields
    let inviteEmail = "";
    let inviteTelegramHandle = "";
    let inviteName = "";

    onMount(async () => {
        await loadTenants();
    });

    async function loadTenants() {
        loading = true;
        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/tenants`, { headers });
            if (res.ok) {
                tenants = await res.json();
            }
        } catch (e) {
            console.error("Failed to load tenants", e);
        }
        loading = false;
    }

    async function createTenant() {
        if (!newSlug || !newName) return;

        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/tenants`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    slug: newSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                    name: newName,
                    description: newDescription
                })
            });

            if (res.ok) {
                await loadTenants();
                closeCreateModal();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to create tenant");
            }
        } catch (e) {
            console.error("Failed to create tenant", e);
        }
    }

    async function deleteTenant(id: number) {
        if (!confirm("Are you sure you want to delete this tenant?")) return;

        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/tenants/${id}`, {
                method: "DELETE",
                headers
            });

            if (res.ok) {
                await loadTenants();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to delete tenant");
            }
        } catch (e) {
            console.error("Failed to delete tenant", e);
        }
    }

    async function openInviteModal(tenant: any) {
        selectedTenant = tenant;
        showInviteModal = true;

        // Load tenant users
        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/tenants/${tenant.id}/users`, { headers });
            if (res.ok) {
                tenantUsers = await res.json();
            }
        } catch (e) {
            console.error("Failed to load tenant users", e);
        }
    }

    async function inviteUser() {
        if (!inviteEmail && !inviteTelegramHandle) {
            alert("Please enter email or Telegram handle");
            return;
        }

        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/tenants/${selectedTenant.id}/invite`, {
                method: "POST",
                headers,
                body: JSON.stringify({
                    email: inviteEmail || undefined,
                    telegram_handle: inviteTelegramHandle || undefined,
                    name: inviteName || undefined
                })
            });

            if (res.ok) {
                const result = await res.json();
                alert(`User ${result.action}: ${result.user.email}`);
                closeInviteModal();
                await loadTenants();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to invite user");
            }
        } catch (e) {
            console.error("Failed to invite user", e);
        }
    }

    function closeCreateModal() {
        showCreateModal = false;
        newSlug = "";
        newName = "";
        newDescription = "";
    }

    function closeInviteModal() {
        showInviteModal = false;
        selectedTenant = null;
        tenantUsers = [];
        inviteEmail = "";
        inviteTelegramHandle = "";
        inviteName = "";
    }

    function openEditModal(tenant: any) {
        selectedTenant = tenant;
        editSlug = tenant.slug;
        editName = tenant.name;
        editDescription = tenant.description || "";
        showEditModal = true;
    }

    function closeEditModal() {
        showEditModal = false;
        selectedTenant = null;
        editSlug = "";
        editName = "";
        editDescription = "";
    }

    async function updateTenant() {
        if (!editSlug || !editName) return;

        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/tenants/${selectedTenant.id}`, {
                method: "PUT",
                headers,
                body: JSON.stringify({
                    slug: editSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
                    name: editName,
                    description: editDescription || null
                })
            });

            if (res.ok) {
                await loadTenants();
                closeEditModal();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to update tenant");
            }
        } catch (e) {
            console.error("Failed to update tenant", e);
        }
    }

    function getTenantUrl(slug: string) {
        return `https://${slug}.tube.twozao.com`;
    }
</script>

<div class="tenants-tab">
    <div class="tab-header">
        <div>
            <h1>Subdomains / Tenants</h1>
            <p class="subtitle">Manage isolated video collections under subdomains</p>
        </div>
        <button class="btn btn-primary" on:click={() => showCreateModal = true}>
            + New Subdomain
        </button>
    </div>

    {#if loading}
        <div class="loading">Loading tenants...</div>
    {:else if tenants.length === 0}
        <div class="empty-state">
            <div class="empty-icon">🏠</div>
            <h3>No subdomains yet</h3>
            <p>Create a subdomain to organize videos for specific audiences</p>
            <button class="btn btn-primary" on:click={() => showCreateModal = true}>
                Create First Subdomain
            </button>
        </div>
    {:else}
        <div class="tenants-grid">
            {#each tenants as tenant}
                <div class="tenant-card">
                    <div class="tenant-header">
                        <h3>{tenant.name}</h3>
                        <div class="tenant-badges">
                            <span class="tenant-id" title="Tenant ID for Telegram import">ID: {tenant.id}</span>
                            <span class="tenant-slug">{tenant.slug}</span>
                        </div>
                    </div>

                    {#if tenant.description}
                        <p class="tenant-desc">{tenant.description}</p>
                    {/if}

                    <div class="tenant-stats">
                        <div class="stat">
                            <span class="stat-value">{tenant.video_count || 0}</span>
                            <span class="stat-label">Videos</span>
                        </div>
                        <div class="stat">
                            <span class="stat-value">{tenant.user_count || 0}</span>
                            <span class="stat-label">Users</span>
                        </div>
                    </div>

                    <div class="tenant-url">
                        <a href={getTenantUrl(tenant.slug)} target="_blank" rel="noopener">
                            {getTenantUrl(tenant.slug)}
                        </a>
                    </div>

                    <div class="tenant-actions">
                        <button class="btn btn-edit" on:click={() => openEditModal(tenant)}>
                            Edit
                        </button>
                        <button class="btn btn-secondary" on:click={() => openInviteModal(tenant)}>
                            Manage Users
                        </button>
                        <button class="btn btn-danger" on:click={() => deleteTenant(tenant.id)}>
                            Delete
                        </button>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<!-- Create Modal -->
{#if showCreateModal}
    <div class="modal-overlay" on:click={closeCreateModal}>
        <div class="modal" on:click|stopPropagation>
            <div class="modal-header">
                <h2>Create New Subdomain</h2>
                <button class="close-btn" on:click={closeCreateModal}>&times;</button>
            </div>

            <div class="modal-body">
                <div class="form-group">
                    <label for="slug">Subdomain Slug</label>
                    <input
                        id="slug"
                        type="text"
                        bind:value={newSlug}
                        placeholder="e.g. learn, play, funny"
                        pattern="[a-z0-9-]+"
                    />
                    <span class="help-text">
                        URL will be: {newSlug ? `${newSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.tube.twozao.com` : '?.tube.twozao.com'}
                    </span>
                </div>

                <div class="form-group">
                    <label for="name">Display Name</label>
                    <input
                        id="name"
                        type="text"
                        bind:value={newName}
                        placeholder="e.g. Learning Videos, Play Time"
                    />
                </div>

                <div class="form-group">
                    <label for="description">Description (optional)</label>
                    <textarea
                        id="description"
                        bind:value={newDescription}
                        placeholder="What kind of videos will this subdomain have?"
                        rows="3"
                    ></textarea>
                </div>
            </div>

            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={closeCreateModal}>Cancel</button>
                <button class="btn btn-primary" on:click={createTenant}>Create Subdomain</button>
            </div>
        </div>
    </div>
{/if}

<!-- Edit Modal -->
{#if showEditModal && selectedTenant}
    <div class="modal-overlay" on:click={closeEditModal}>
        <div class="modal" on:click|stopPropagation>
            <div class="modal-header">
                <h2>Edit Subdomain</h2>
                <button class="close-btn" on:click={closeEditModal}>&times;</button>
            </div>

            <div class="modal-body">
                <div class="form-group">
                    <label>Tenant ID</label>
                    <div class="readonly-field">{selectedTenant.id}</div>
                    <span class="help-text">Use this ID for Telegram import: url {selectedTenant.id}</span>
                </div>

                <div class="form-group">
                    <label for="editSlug">Subdomain Slug</label>
                    <input
                        id="editSlug"
                        type="text"
                        bind:value={editSlug}
                        placeholder="e.g. learn, play, funny"
                        pattern="[a-z0-9-]+"
                    />
                    <span class="help-text">
                        URL will be: {editSlug ? `${editSlug.toLowerCase().replace(/[^a-z0-9-]/g, '-')}.tube.twozao.com` : '?.tube.twozao.com'}
                    </span>
                </div>

                <div class="form-group">
                    <label for="editName">Display Name</label>
                    <input
                        id="editName"
                        type="text"
                        bind:value={editName}
                        placeholder="e.g. Learning Videos, Play Time"
                    />
                </div>

                <div class="form-group">
                    <label for="editDescription">Description (optional)</label>
                    <textarea
                        id="editDescription"
                        bind:value={editDescription}
                        placeholder="What kind of videos will this subdomain have?"
                        rows="3"
                    ></textarea>
                </div>
            </div>

            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={closeEditModal}>Cancel</button>
                <button class="btn btn-primary" on:click={updateTenant}>Save Changes</button>
            </div>
        </div>
    </div>
{/if}

<!-- Invite Modal -->
{#if showInviteModal && selectedTenant}
    <div class="modal-overlay" on:click={closeInviteModal}>
        <div class="modal modal-large" on:click|stopPropagation>
            <div class="modal-header">
                <h2>Manage Users - {selectedTenant.name}</h2>
                <button class="close-btn" on:click={closeInviteModal}>&times;</button>
            </div>

            <div class="modal-body">
                <div class="invite-section">
                    <h3>Invite User</h3>
                    <p class="help-text">Users invited via Telegram handle will have their videos automatically added to this subdomain.</p>

                    <div class="form-row">
                        <div class="form-group">
                            <label for="inviteEmail">Email</label>
                            <input
                                id="inviteEmail"
                                type="email"
                                bind:value={inviteEmail}
                                placeholder="user@example.com"
                            />
                        </div>

                        <div class="form-group">
                            <label for="inviteTelegram">Telegram Handle</label>
                            <input
                                id="inviteTelegram"
                                type="text"
                                bind:value={inviteTelegramHandle}
                                placeholder="@username"
                            />
                        </div>
                    </div>

                    <div class="form-group">
                        <label for="inviteName">Display Name (optional)</label>
                        <input
                            id="inviteName"
                            type="text"
                            bind:value={inviteName}
                            placeholder="User's name"
                        />
                    </div>

                    <button class="btn btn-primary" on:click={inviteUser}>
                        Invite User
                    </button>
                </div>

                {#if tenantUsers.length > 0}
                    <div class="users-section">
                        <h3>Current Users ({tenantUsers.length})</h3>
                        <table class="users-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Email</th>
                                    <th>Telegram</th>
                                    <th>Joined</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each tenantUsers as user}
                                    <tr>
                                        <td>{user.channel_name || '-'}</td>
                                        <td>{user.email}</td>
                                        <td>{user.telegram_handle || '-'}</td>
                                        <td>{new Date(user.created_at).toLocaleDateString()}</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {:else}
                    <div class="users-section">
                        <p class="empty-text">No users assigned to this subdomain yet.</p>
                    </div>
                {/if}
            </div>

            <div class="modal-footer">
                <button class="btn btn-secondary" on:click={closeInviteModal}>Close</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .tenants-tab {
        padding: var(--space-md);
    }

    .tab-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--space-xl);
        flex-wrap: wrap;
        gap: var(--space-md);
    }

    .tab-header h1 {
        margin: 0;
        font-size: 1.5rem;
    }

    .subtitle {
        color: var(--admin-text-light);
        margin: var(--space-xs) 0 0;
    }

    .loading {
        text-align: center;
        padding: var(--space-xl);
        color: var(--admin-text-light);
    }

    .empty-state {
        text-align: center;
        padding: var(--space-xxl);
        background: var(--admin-card);
        border-radius: var(--radius-lg);
    }

    .empty-icon {
        font-size: 3rem;
        margin-bottom: var(--space-md);
    }

    .empty-state h3 {
        margin: 0 0 var(--space-sm);
    }

    .empty-state p {
        color: var(--admin-text-light);
        margin-bottom: var(--space-lg);
    }

    .tenants-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: var(--space-lg);
    }

    .tenant-card {
        background: var(--admin-card);
        border-radius: var(--radius-lg);
        padding: var(--space-lg);
        border: 1px solid var(--admin-border);
    }

    .tenant-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: var(--space-sm);
        gap: var(--space-sm);
    }

    .tenant-header h3 {
        margin: 0;
        font-size: 1.2rem;
    }

    .tenant-badges {
        display: flex;
        gap: var(--space-xs);
        flex-wrap: wrap;
    }

    .tenant-id {
        background: #f59e0b;
        color: white;
        padding: var(--space-xs) var(--space-sm);
        border-radius: var(--radius-sm);
        font-size: 0.75rem;
        font-family: monospace;
        font-weight: 600;
    }

    .tenant-slug {
        background: var(--admin-primary);
        color: white;
        padding: var(--space-xs) var(--space-sm);
        border-radius: var(--radius-sm);
        font-size: 0.8rem;
        font-family: monospace;
    }

    .readonly-field {
        background: var(--admin-bg);
        border: 1px solid var(--admin-border);
        border-radius: var(--radius-md);
        padding: var(--space-sm) var(--space-md);
        font-family: monospace;
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--admin-primary);
    }

    .btn-edit {
        background: #f59e0b;
        color: white;
    }

    .btn-edit:hover {
        background: #d97706;
    }

    .tenant-desc {
        color: var(--admin-text-light);
        font-size: 0.9rem;
        margin-bottom: var(--space-md);
    }

    .tenant-stats {
        display: flex;
        gap: var(--space-lg);
        margin-bottom: var(--space-md);
    }

    .stat {
        display: flex;
        flex-direction: column;
    }

    .stat-value {
        font-size: 1.5rem;
        font-weight: 600;
        color: var(--admin-primary);
    }

    .stat-label {
        font-size: 0.8rem;
        color: var(--admin-text-light);
    }

    .tenant-url {
        margin-bottom: var(--space-md);
    }

    .tenant-url a {
        color: var(--admin-primary);
        font-size: 0.85rem;
        word-break: break-all;
    }

    .tenant-actions {
        display: flex;
        gap: var(--space-sm);
        flex-wrap: wrap;
    }

    /* Modal */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        padding: var(--space-md);
    }

    .modal {
        background: var(--admin-card);
        border-radius: var(--radius-lg);
        width: 100%;
        max-width: 500px;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .modal-large {
        max-width: 700px;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-lg);
        border-bottom: 1px solid var(--admin-border);
    }

    .modal-header h2 {
        margin: 0;
        font-size: 1.2rem;
    }

    .close-btn {
        background: none;
        border: none;
        font-size: 1.5rem;
        color: var(--admin-text-light);
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }

    .modal-body {
        padding: var(--space-lg);
        overflow-y: auto;
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-sm);
        padding: var(--space-lg);
        border-top: 1px solid var(--admin-border);
    }

    .form-group {
        margin-bottom: var(--space-md);
    }

    .form-group label {
        display: block;
        margin-bottom: var(--space-xs);
        font-weight: 500;
        font-size: 0.9rem;
    }

    .form-group input,
    .form-group textarea {
        width: 100%;
        padding: var(--space-sm) var(--space-md);
        border: 1px solid var(--admin-border);
        border-radius: var(--radius-md);
        background: var(--admin-bg);
        color: var(--admin-text);
        font-size: 0.95rem;
    }

    .form-group input:focus,
    .form-group textarea:focus {
        outline: none;
        border-color: var(--admin-primary);
    }

    .form-row {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: var(--space-md);
    }

    .help-text {
        font-size: 0.8rem;
        color: var(--admin-text-light);
        margin-top: var(--space-xs);
    }

    /* Buttons */
    .btn {
        padding: var(--space-sm) var(--space-lg);
        border: none;
        border-radius: var(--radius-md);
        font-size: 0.9rem;
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    .btn-primary {
        background: var(--admin-primary);
        color: white;
    }

    .btn-primary:hover {
        background: var(--admin-primary-hover);
    }

    .btn-secondary {
        background: var(--admin-border);
        color: var(--admin-text);
    }

    .btn-secondary:hover {
        background: var(--admin-sidebar-hover);
    }

    .btn-danger {
        background: #dc2626;
        color: white;
    }

    .btn-danger:hover {
        background: #b91c1c;
    }

    /* Invite Modal Sections */
    .invite-section {
        margin-bottom: var(--space-xl);
        padding-bottom: var(--space-xl);
        border-bottom: 1px solid var(--admin-border);
    }

    .invite-section h3,
    .users-section h3 {
        margin: 0 0 var(--space-md);
        font-size: 1rem;
    }

    .users-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.9rem;
    }

    .users-table th,
    .users-table td {
        text-align: left;
        padding: var(--space-sm) var(--space-md);
        border-bottom: 1px solid var(--admin-border);
    }

    .users-table th {
        font-weight: 600;
        color: var(--admin-text-light);
        font-size: 0.8rem;
        text-transform: uppercase;
    }

    .empty-text {
        color: var(--admin-text-light);
        text-align: center;
        padding: var(--space-lg);
    }

    @media (max-width: 600px) {
        .form-row {
            grid-template-columns: 1fr;
        }

        .tenant-actions {
            flex-direction: column;
        }

        .tenant-actions .btn {
            width: 100%;
        }
    }
</style>
