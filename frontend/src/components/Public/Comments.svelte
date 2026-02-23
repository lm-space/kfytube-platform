<script lang="ts">
    import { onMount } from "svelte";
    import { API_BASE, userName, getApiHeaders } from "../../lib/stores";

    export let videoId: string | number;

    let comments: any[] = [];
    let loading = true;
    let newComment = "";
    let posting = false;
    let showNamePrompt = false;
    let tempName = "";

    // Speech-to-text
    let isRecording = false;
    let recognition: any = null;
    let speechSupported = false;

    onMount(async () => {
        // Check for speech recognition support
        const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        if (SpeechRecognition) {
            speechSupported = true;
            recognition = new SpeechRecognition();
            recognition.continuous = false;
            recognition.interimResults = true;
            recognition.lang = 'en-US';

            recognition.onresult = (event: any) => {
                let transcript = '';
                for (let i = 0; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript;
                }
                newComment = transcript;
            };

            recognition.onend = () => {
                isRecording = false;
            };

            recognition.onerror = (event: any) => {
                console.error('Speech recognition error:', event.error);
                isRecording = false;
            };
        }

        await loadComments();
    });

    async function loadComments() {
        loading = true;
        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/videos/${videoId}/comments`, { headers });
            if (res.ok) {
                comments = await res.json();
            }
        } catch (e) {
            console.error("Failed to load comments", e);
        }
        loading = false;
    }

    function toggleRecording() {
        if (!recognition) return;

        if (isRecording) {
            recognition.stop();
            isRecording = false;
        } else {
            recognition.start();
            isRecording = true;
        }
    }

    async function postComment() {
        if (!newComment.trim()) return;

        // Use "Unknown" if no name is set
        const authorName = $userName || "Unknown";

        posting = true;
        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/videos/${videoId}/comments`, {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    author_name: authorName,
                    content: newComment.trim()
                })
            });

            if (res.ok) {
                const comment = await res.json();
                comments = [comment, ...comments];
                newComment = "";
            } else {
                const err = await res.json();
                alert(err.error || "Failed to post comment");
            }
        } catch (e) {
            console.error("Failed to post comment", e);
        }
        posting = false;
    }

    function saveName() {
        if (tempName.trim()) {
            userName.set(tempName.trim());
            showNamePrompt = false;
            // Now post the comment
            postComment();
        }
    }

    function formatTimeAgo(dateStr: string): string {
        const date = new Date(dateStr);
        const now = new Date();
        const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (seconds < 60) return 'just now';
        if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes ago`;
        if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours ago`;
        if (seconds < 604800) return `${Math.floor(seconds / 86400)} days ago`;
        return date.toLocaleDateString();
    }

    function getInitial(name: string): string {
        return name.charAt(0).toUpperCase();
    }
</script>

<div class="comments-container">
    <h3 class="comments-title">{comments.length} Comments</h3>

    <!-- Comment Input -->
    <div class="comment-input-wrapper">
        <div class="comment-avatar">
            {$userName ? getInitial($userName) : '?'}
        </div>
        <div class="comment-input-area">
            <textarea
                bind:value={newComment}
                placeholder={$userName ? `Add a comment as ${$userName}...` : "Add a comment..."}
                rows="2"
                on:keydown={(e) => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), postComment())}
            ></textarea>
            <div class="comment-actions">
                {#if speechSupported}
                    <button
                        class="mic-btn"
                        class:recording={isRecording}
                        on:click={toggleRecording}
                        title={isRecording ? "Stop recording" : "Voice input"}
                    >
                        <svg viewBox="0 0 24 24" width="20" height="20">
                            <path fill="currentColor" d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1-9c0-.55.45-1 1-1s1 .45 1 1v6c0 .55-.45 1-1 1s-1-.45-1-1V5z"/>
                            <path fill="currentColor" d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
                        </svg>
                    </button>
                {/if}
                <button
                    class="post-btn"
                    on:click={postComment}
                    disabled={posting || !newComment.trim()}
                >
                    {posting ? "Posting..." : "Comment"}
                </button>
            </div>
        </div>
    </div>

    <!-- Name Prompt Modal -->
    {#if showNamePrompt}
        <div class="name-modal-overlay" on:click={() => showNamePrompt = false}>
            <div class="name-modal" on:click|stopPropagation>
                <h4>What's your name?</h4>
                <p>Enter your name to post comments. This will be saved for future comments.</p>
                <input
                    type="text"
                    bind:value={tempName}
                    placeholder="Your name"
                    maxlength="50"
                    on:keydown={(e) => e.key === 'Enter' && saveName()}
                    autofocus
                />
                <div class="modal-actions">
                    <button class="cancel-btn" on:click={() => showNamePrompt = false}>Cancel</button>
                    <button class="save-btn" on:click={saveName} disabled={!tempName.trim()}>Save & Comment</button>
                </div>
            </div>
        </div>
    {/if}

    <!-- Comments List -->
    {#if loading}
        <div class="loading">Loading comments...</div>
    {:else if comments.length === 0}
        <div class="no-comments">No comments yet. Be the first to comment!</div>
    {:else}
        <div class="comments-list">
            {#each comments as comment}
                <div class="comment">
                    <div class="comment-avatar">{getInitial(comment.author_name)}</div>
                    <div class="comment-body">
                        <div class="comment-header">
                            <span class="comment-author">{comment.author_name}</span>
                            <span class="comment-time">{formatTimeAgo(comment.created_at)}</span>
                        </div>
                        <p class="comment-content">{comment.content}</p>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .comments-container {
        margin-top: 24px;
        padding-top: 16px;
        border-top: 1px solid #333;
    }

    .comments-title {
        margin: 0 0 16px;
        font-size: 1rem;
        font-weight: 500;
        color: #fff;
    }

    .comment-input-wrapper {
        display: flex;
        gap: 12px;
        margin-bottom: 24px;
    }

    .comment-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background: #606060;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 500;
        color: white;
        flex-shrink: 0;
    }

    .comment-input-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .comment-input-area textarea {
        width: 100%;
        padding: 10px 12px;
        border: none;
        border-bottom: 1px solid #444;
        background: transparent;
        color: #fff;
        font-size: 0.95rem;
        resize: none;
        font-family: inherit;
    }

    .comment-input-area textarea:focus {
        outline: none;
        border-bottom-color: #3ea6ff;
    }

    .comment-input-area textarea::placeholder {
        color: #888;
    }

    .comment-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
    }

    .mic-btn {
        background: transparent;
        border: none;
        color: #aaa;
        cursor: pointer;
        padding: 8px;
        border-radius: 50%;
        transition: all 0.2s;
    }

    .mic-btn:hover {
        background: #333;
        color: #fff;
    }

    .mic-btn.recording {
        color: #ff0000;
        animation: pulse 1s infinite;
    }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }

    .post-btn {
        background: #3ea6ff;
        color: #000;
        border: none;
        padding: 8px 16px;
        border-radius: 18px;
        font-weight: 500;
        cursor: pointer;
        font-size: 0.9rem;
        transition: opacity 0.2s;
    }

    .post-btn:hover:not(:disabled) {
        opacity: 0.9;
    }

    .post-btn:disabled {
        background: #333;
        color: #717171;
        cursor: not-allowed;
    }

    /* Name Modal */
    .name-modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.8);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .name-modal {
        background: #212121;
        padding: 24px;
        border-radius: 12px;
        max-width: 400px;
        width: 90%;
    }

    .name-modal h4 {
        margin: 0 0 8px;
        color: #fff;
    }

    .name-modal p {
        color: #aaa;
        font-size: 0.9rem;
        margin: 0 0 16px;
    }

    .name-modal input {
        width: 94%;
        max-width: 94%;
        padding: 12px;
        border: 1px solid #444;
        border-radius: 8px;
        background: #181818;
        color: #fff;
        font-size: 1rem;
        margin-bottom: 16px;
        box-sizing: border-box;
    }

    .name-modal input:focus {
        outline: none;
        border-color: #3ea6ff;
    }

    .modal-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
    }

    .cancel-btn {
        background: transparent;
        border: 1px solid #444;
        color: #fff;
        padding: 8px 16px;
        border-radius: 18px;
        cursor: pointer;
    }

    .save-btn {
        background: #3ea6ff;
        color: #000;
        border: none;
        padding: 8px 16px;
        border-radius: 18px;
        font-weight: 500;
        cursor: pointer;
    }

    .save-btn:disabled {
        background: #333;
        color: #717171;
        cursor: not-allowed;
    }

    /* Comments List */
    .loading, .no-comments {
        color: #888;
        text-align: center;
        padding: 20px;
    }

    .comments-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
    }

    .comment {
        display: flex;
        gap: 12px;
    }

    .comment-body {
        flex: 1;
    }

    .comment-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
    }

    .comment-author {
        font-weight: 500;
        color: #fff;
        font-size: 0.9rem;
    }

    .comment-time {
        color: #888;
        font-size: 0.8rem;
    }

    .comment-content {
        margin: 0;
        color: #e0e0e0;
        font-size: 0.95rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
    }
</style>
