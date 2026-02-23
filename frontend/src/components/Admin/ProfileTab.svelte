<script>
    import { onMount } from "svelte";
    import { API_BASE, token } from "../../lib/stores";

    let channelName = "";
    let newPassword = "";
    let confirmPassword = "";
    let loading = false;
    let message = "";
    let error = "";

    onMount(async () => {
        try {
            const res = await fetch(`${API_BASE}/me`, {
                headers: { Authorization: `Bearer ${$token}` },
            });
            if (res.ok) {
                const user = await res.json();
                channelName = user.channel_name || "";
            }
        } catch (e) {
            console.error(e);
        }
    });

    async function save() {
        if (newPassword && newPassword !== confirmPassword) {
            error = "Passwords do not match";
            return;
        }

        loading = true;
        message = "";
        error = "";

        try {
            const body = { channel_name: channelName };
            if (newPassword) body.password = newPassword;

            const res = await fetch(`${API_BASE}/profile`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${$token}`,
                },
                body: JSON.stringify(body),
            });

            if (res.ok) {
                message = "Profile updated successfully!";
                newPassword = "";
                confirmPassword = "";
            } else {
                const data = await res.json();
                error = data.error || "Failed to update profile";
            }
        } catch (e) {
            error = e.message;
        } finally {
            loading = false;
        }
    }
</script>

<div class="card">
    <h2>My Profile</h2>

    {#if message}
        <div class="success">{message}</div>
    {/if}
    {#if error}
        <div class="error">{error}</div>
    {/if}

    <div class="form-group">
        <label for="cname">Channel Name</label>
        <p class="hint">This name will be displayed next to your videos.</p>
        <input type="text" id="cname" bind:value={channelName} />
    </div>

    <hr />
    <h3>Change Password</h3>

    <div class="form-group">
        <label for="pass">New Password</label>
        <input
            type="password"
            id="pass"
            bind:value={newPassword}
            placeholder="Leave blank to keep current"
        />
    </div>

    <div class="form-group">
        <label for="cpass">Confirm New Password</label>
        <input type="password" id="cpass" bind:value={confirmPassword} />
    </div>

    <button on:click={save} disabled={loading}>
        {loading ? "Saving..." : "Save Changes"}
    </button>
</div>

<style>
    /* Card Styles */
    .card {
        background: var(--admin-card);
        padding: var(--space-xl);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-sm);
        border: 1px solid var(--admin-border);
        max-width: 600px;
    }

    h2 {
        margin: 0 0 var(--space-lg) 0;
        font-size: 1.25rem;
        color: var(--admin-text);
        display: flex;
        align-items: center;
        gap: var(--space-sm);
    }

    h2::before {
        content: '⚙️';
    }

    h3 {
        margin: 0 0 var(--space-lg) 0;
        font-size: 1rem;
        color: var(--admin-text);
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

    .hint {
        font-size: 0.8rem;
        color: var(--admin-text-muted);
        margin: 0 0 var(--space-sm) 0;
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

    .success {
        padding: var(--space-md);
        background: var(--admin-success-light);
        color: #065f46;
        border-radius: var(--radius-md);
        margin-bottom: var(--space-lg);
        font-size: 0.875rem;
        display: flex;
        align-items: center;
        gap: var(--space-sm);
    }

    .success::before {
        content: '✓';
        font-weight: bold;
    }

    .error {
        padding: var(--space-md);
        background: var(--admin-danger-light);
        color: #991b1b;
        border-radius: var(--radius-md);
        margin-bottom: var(--space-lg);
        font-size: 0.875rem;
        display: flex;
        align-items: center;
        gap: var(--space-sm);
    }

    .error::before {
        content: '!';
        font-weight: bold;
    }

    hr {
        margin: var(--space-xl) 0;
        border: 0;
        border-top: 1px solid var(--admin-border);
    }

    /* Responsive */
    @media (max-width: 768px) {
        .card {
            padding: var(--space-lg);
            max-width: 100%;
        }
    }

    @media (max-width: 480px) {
        .card {
            padding: var(--space-md);
        }

        h2 {
            font-size: 1.1rem;
        }

        button {
            width: 100%;
        }
    }
</style>
