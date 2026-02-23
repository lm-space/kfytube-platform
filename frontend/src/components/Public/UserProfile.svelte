<script lang="ts">
    import { userName } from "../../lib/stores";

    let showEditModal = false;
    let tempName = "";

    function openEdit() {
        tempName = $userName || "";
        showEditModal = true;
    }

    function saveName() {
        if (tempName.trim()) {
            userName.set(tempName.trim());
        }
        showEditModal = false;
    }

    function getInitial(name: string): string {
        return name ? name.charAt(0).toUpperCase() : '?';
    }
</script>

<button class="profile-btn" on:click={openEdit} title={$userName ? `Logged in as ${$userName}` : "Set your name"}>
    <div class="avatar">
        <span>{getInitial($userName)}</span>
    </div>
    {#if $userName}
        <span class="profile-name">{$userName}</span>
    {/if}
</button>

{#if showEditModal}
    <div class="modal-overlay" on:click={() => showEditModal = false}>
        <div class="modal" on:click|stopPropagation>
            <h3>Your Profile</h3>
            <p>Set your name to personalize your experience and post comments.</p>

            <div class="preview">
                <div class="avatar large">{getInitial(tempName)}</div>
                <span class="preview-name">{tempName || "Your Name"}</span>
            </div>

            <input
                type="text"
                bind:value={tempName}
                placeholder="Enter your name"
                maxlength="50"
                on:keydown={(e) => e.key === 'Enter' && saveName()}
                autofocus
            />

            <div class="modal-actions">
                <button class="cancel-btn" on:click={() => showEditModal = false}>Cancel</button>
                <button class="save-btn" on:click={saveName}>Save</button>
            </div>
        </div>
    </div>
{/if}

<style>
    .profile-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        background: transparent;
        border: none;
        cursor: pointer;
        padding: 4px 8px;
        border-radius: 20px;
        transition: background 0.2s;
    }

    .profile-btn:hover {
        background: rgba(255, 255, 255, 0.1);
    }

    .avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        background: #606060;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 500;
        color: white;
        font-size: 14px;
    }

    .avatar.large {
        width: 64px;
        height: 64px;
        font-size: 28px;
    }

    .profile-name {
        color: #fff;
        font-size: 14px;
        max-width: 100px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* Modal */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: #212121;
        padding: 24px;
        border-radius: 12px;
        max-width: 400px;
        width: 90%;
        text-align: center;
    }

    .modal h3 {
        margin: 0 0 8px;
        color: #fff;
        font-size: 1.25rem;
    }

    .modal p {
        color: #aaa;
        font-size: 0.9rem;
        margin: 0 0 24px;
    }

    .preview {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        margin-bottom: 24px;
    }

    .preview-name {
        color: #fff;
        font-size: 1.1rem;
        font-weight: 500;
    }

    .modal input {
        width: 94%;
        max-width: 94%;
        padding: 12px;
        border: 1px solid #444;
        border-radius: 8px;
        background: #181818;
        color: #fff;
        font-size: 1rem;
        margin-bottom: 24px;
        text-align: center;
        box-sizing: border-box;
    }

    .modal input:focus {
        outline: none;
        border-color: #3ea6ff;
    }

    .modal-actions {
        display: flex;
        justify-content: center;
        gap: 12px;
    }

    .cancel-btn {
        background: transparent;
        border: 1px solid #444;
        color: #fff;
        padding: 10px 24px;
        border-radius: 20px;
        cursor: pointer;
        font-size: 0.9rem;
    }

    .cancel-btn:hover {
        background: #333;
    }

    .save-btn {
        background: #3ea6ff;
        color: #000;
        border: none;
        padding: 10px 24px;
        border-radius: 20px;
        font-weight: 500;
        cursor: pointer;
        font-size: 0.9rem;
    }

    .save-btn:hover {
        opacity: 0.9;
    }

    @media (max-width: 480px) {
        .profile-name {
            display: none;
        }
    }
</style>
