<script>
    import { onMount } from "svelte";
    import { API_BASE, token } from "../../lib/stores";

    let inviteEmail = "";
    let magicLink = "";
    let loading = false;
    let error = "";
    let users = [];

    // Edit state
    let editingId = null;
    let editEmail = "";
    let editChannelName = "";
    let editTelegramHandle = "";

    async function loadUsers() {
        try {
            const res = await fetch(`${API_BASE}/users`, {
                headers: {
                    Authorization: `Bearer ${$token}`,
                },
            });
            if (res.ok) {
                users = await res.json();
            }
        } catch (e) {
            console.error(e);
        }
    }

    onMount(() => {
        loadUsers();
    });

    async function inviteUser() {
        if (!inviteEmail) return;
        loading = true;
        error = "";
        magicLink = "";

        try {
            const res = await fetch(`${API_BASE}/invite`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: inviteEmail }),
            });
            const data = await res.json();
            if (res.ok) {
                magicLink = `${window.location.origin}/login?magic=${data.magic_link}`;
                inviteEmail = "";
                loadUsers();
            } else {
                error = data.error || "Failed to invite";
            }
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }

    function startEdit(u) {
        editingId = u.id;
        editEmail = u.email;
        editChannelName = u.channel_name || "";
        editTelegramHandle = u.telegram_handle || "";
    }

    function cancelEdit() {
        editingId = null;
        editEmail = "";
        editChannelName = "";
        editTelegramHandle = "";
    }

    async function saveEdit(id) {
        try {
            const res = await fetch(`${API_BASE}/users/${id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${$token}`,
                },
                body: JSON.stringify({
                    email: editEmail,
                    channel_name: editChannelName,
                    telegram_handle: editTelegramHandle || null,
                }),
            });
            if (res.ok) {
                users = users.map((u) =>
                    u.id === id
                        ? { ...u, email: editEmail, channel_name: editChannelName, telegram_handle: editTelegramHandle }
                        : u,
                );
                cancelEdit();
            } else {
                const data = await res.json();
                error = data.error || "Failed to update user";
            }
        } catch (e) {
            error = e.message;
        }
    }

    async function deleteUser(id) {
        if (!confirm("Delete this user? All their videos and playlists will be permanently deleted."))
            return;

        try {
            const res = await fetch(`${API_BASE}/users/${id}`, {
                method: "DELETE",
                headers: {
                    Authorization: `Bearer ${$token}`,
                },
            });
            if (res.ok) {
                users = users.filter((u) => u.id !== id);
            } else {
                const data = await res.json();
                error = data.error || "Failed to delete user";
            }
        } catch (e) {
            error = e.message;
        }
    }
</script>

<div class="card">
    <h2>Invite New User</h2>
    <p>
        Invite a new admin/creator. They will receive their own Channel based on
        their email.
    </p>

    <div class="form-group">
        <label for="email">Email Address</label>
        <input
            type="email"
            id="email"
            bind:value={inviteEmail}
            placeholder="friend@example.com"
        />
    </div>

    <button on:click={inviteUser} disabled={loading}>
        {loading ? "Generating..." : "Generate Invite Link"}
    </button>

    {#if error}
        <div class="error">{error}</div>
    {/if}

    {#if magicLink}
        <div class="success-box">
            <h3>Invite Generated!</h3>
            <p>Share this secret link with the user:</p>
            <div class="code-block">
                {magicLink}
            </div>
            <button
                class="copy-btn"
                on:click={() => navigator.clipboard.writeText(magicLink)}
                >Copy Link</button
            >
        </div>
    {/if}
</div>

<div class="total-banner">
    <span class="total-count">{users.length}</span>
    <span class="total-label">Total Users</span>
</div>

<div class="card" style="margin-top: 0;">
    <h2>Users</h2>
    <p class="hint">Set a user's Telegram handle to auto-assign videos they send via Telegram to their subdomain.</p>
    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>Email</th>
                <th>Channel Name</th>
                <th>Telegram</th>
                <th>Joined</th>
                <th>Actions</th>
            </tr>
        </thead>
        <tbody>
            {#each users as u}
                <tr>
                    <td>{u.id}</td>
                    {#if editingId === u.id}
                        <td>
                            <input
                                type="email"
                                bind:value={editEmail}
                                class="edit-input"
                            />
                        </td>
                        <td>
                            <input
                                type="text"
                                bind:value={editChannelName}
                                class="edit-input"
                            />
                        </td>
                        <td>
                            <input
                                type="text"
                                bind:value={editTelegramHandle}
                                class="edit-input"
                                placeholder="@username"
                            />
                        </td>
                        <td>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td class="actions">
                            <button class="btn-save" on:click={() => saveEdit(u.id)}>Save</button>
                            <button class="btn-cancel" on:click={cancelEdit}>Cancel</button>
                        </td>
                    {:else}
                        <td>{u.email}</td>
                        <td>{u.channel_name || "-"}</td>
                        <td class="telegram-cell">{u.telegram_handle || "-"}</td>
                        <td>{new Date(u.created_at).toLocaleDateString()}</td>
                        <td class="actions">
                            <button class="btn-edit" on:click={() => startEdit(u)}>Edit</button>
                            {#if u.id !== 1}
                                <button class="btn-danger" on:click={() => deleteUser(u.id)}>Delete</button>
                            {/if}
                        </td>
                    {/if}
                </tr>
            {/each}
        </tbody>
    </table>
</div>

<style>
    /* Total Banner */
    .total-banner {
        background: linear-gradient(135deg, #4caf50, #388e3c);
        color: white;
        padding: var(--space-lg) var(--space-xl);
        border-radius: var(--radius-lg);
        margin-bottom: var(--space-xl);
        display: flex;
        align-items: center;
        gap: var(--space-md);
        box-shadow: var(--shadow-md);
    }

    .total-count {
        font-size: 2.5rem;
        font-weight: 700;
        line-height: 1;
    }

    .total-label {
        font-size: 1rem;
        opacity: 0.9;
    }

    /* Card Styles */
    .card {
        background: var(--admin-card);
        padding: var(--space-xl);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
        border: 1px solid var(--admin-border);
    }

    h2 {
        margin: 0 0 var(--space-md) 0;
        font-size: 1.25rem;
        color: var(--admin-text);
        display: flex;
        align-items: center;
        gap: var(--space-sm);
    }

    h2::before {
        content: '👥';
    }

    p {
        color: var(--admin-text-muted);
        font-size: 0.875rem;
        margin-bottom: var(--space-lg);
    }

    .hint {
        background: var(--admin-bg);
        padding: var(--space-sm) var(--space-md);
        border-radius: var(--radius-md);
        border-left: 3px solid var(--admin-primary);
        font-size: 0.8rem;
    }

    .telegram-cell {
        font-family: monospace;
        color: var(--admin-primary);
    }

    /* Form */
    .form-group {
        margin-bottom: var(--space-lg);
    }

    label {
        display: block;
        margin-bottom: var(--space-sm);
        font-weight: 500;
        color: var(--admin-text);
        font-size: 0.875rem;
    }

    input {
        width: 100%;
        padding: var(--space-md);
        border: 1px solid var(--admin-border);
        border-radius: var(--radius-md);
        font-size: 0.875rem;
        transition: all var(--transition-fast);
    }

    input:focus {
        outline: none;
        border-color: var(--admin-primary);
        box-shadow: 0 0 0 3px var(--admin-primary-light);
    }

    button {
        background: var(--admin-primary);
        color: white;
        padding: var(--space-md) var(--space-lg);
        border: none;
        border-radius: var(--radius-md);
        font-weight: 600;
        font-size: 0.875rem;
        cursor: pointer;
        transition: all var(--transition-fast);
    }

    button:hover {
        background: var(--admin-primary-hover);
        transform: translateY(-1px);
    }

    button:active {
        transform: translateY(0);
    }

    button:disabled {
        background: #93c5fd;
        cursor: not-allowed;
        transform: none;
    }

    .error {
        margin-top: var(--space-md);
        padding: var(--space-md);
        background: var(--admin-danger-light);
        color: var(--admin-danger);
        border-radius: var(--radius-md);
        font-size: 0.875rem;
    }

    .success-box {
        margin-top: var(--space-xl);
        background: var(--admin-success-light);
        border: 1px solid var(--admin-success);
        padding: var(--space-lg);
        border-radius: var(--radius-lg);
    }

    .success-box h3 {
        margin: 0 0 var(--space-sm) 0;
        color: #065f46;
        font-size: 1rem;
    }

    .success-box p {
        margin: 0 0 var(--space-md) 0;
        color: #047857;
    }

    .code-block {
        background: white;
        padding: var(--space-md);
        border: 1px solid var(--admin-border);
        border-radius: var(--radius-md);
        font-family: monospace;
        font-size: 0.8rem;
        word-break: break-all;
        margin: var(--space-md) 0;
    }

    .copy-btn {
        background: var(--admin-success) !important;
        font-size: 0.8rem;
        padding: var(--space-sm) var(--space-md);
    }

    .copy-btn:hover {
        background: #059669 !important;
    }

    /* Users Table */
    table {
        width: 100%;
        border-collapse: collapse;
        margin-top: var(--space-lg);
    }

    th, td {
        text-align: left;
        padding: var(--space-md);
        border-bottom: 1px solid var(--admin-border);
    }

    th {
        font-weight: 600;
        color: var(--admin-text);
        background: var(--admin-bg);
        font-size: 0.8rem;
        text-transform: uppercase;
        letter-spacing: 0.03em;
    }

    td {
        font-size: 0.875rem;
        color: var(--admin-text-muted);
    }

    tbody tr:hover {
        background: var(--admin-bg);
    }

    .actions {
        display: flex;
        gap: var(--space-xs);
        flex-wrap: wrap;
    }

    .btn-edit {
        background: var(--admin-primary) !important;
        padding: var(--space-xs) var(--space-sm);
        font-size: 0.75rem;
    }

    .btn-danger {
        background: var(--admin-danger) !important;
        padding: var(--space-xs) var(--space-sm);
        font-size: 0.75rem;
    }

    .btn-danger:hover {
        background: #dc2626 !important;
    }

    .btn-save {
        background: var(--admin-success) !important;
        padding: var(--space-xs) var(--space-sm);
        font-size: 0.75rem;
    }

    .btn-save:hover {
        background: #059669 !important;
    }

    .btn-cancel {
        background: var(--admin-text-muted) !important;
        padding: var(--space-xs) var(--space-sm);
        font-size: 0.75rem;
    }

    .edit-input {
        width: 100%;
        padding: var(--space-xs) var(--space-sm);
        border: 1px solid var(--admin-primary);
        border-radius: var(--radius-sm);
        font-size: 0.8rem;
    }

    .edit-input:focus {
        outline: none;
        box-shadow: 0 0 0 2px var(--admin-primary-light);
    }

    /* Responsive */
    @media (max-width: 768px) {
        .card {
            padding: var(--space-lg);
        }

        table {
            display: block;
            overflow-x: auto;
        }

        th, td {
            padding: var(--space-sm);
            font-size: 0.8rem;
        }
    }

    @media (max-width: 480px) {
        .card {
            padding: var(--space-md);
        }

        h2 {
            font-size: 1.1rem;
        }
    }
</style>
