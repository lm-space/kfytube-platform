<script>
    import { onMount } from "svelte";
    import { token, API_BASE, refreshData } from "../../lib/stores";

    let email = "";
    let password = "";

    onMount(() => {
        const url = new URL(window.location.href);
        const magic = url.searchParams.get("magic");
        if (magic) {
            token.set(magic);
            refreshData();
            // Redirect to admin to clear the URL query param and switch view
            window.location.href = "/admin";
        }
    });

    async function login() {
        const res = await fetch(API_BASE + "/login", {
            method: "POST",
            body: JSON.stringify({ email, password }),
        });
        if (res.ok) {
            const data = await res.json();
            token.set(data.token);
            refreshData();
        } else {
            alert("Login failed");
        }
    }
</script>

<div class="login-container">
    <div class="card">
        <h1>Tube Admin</h1>
        <input bind:value={email} placeholder="Email" />
        <input type="password" bind:value={password} placeholder="Password" />
        <button on:click={login}>Sign In</button>
    </div>
</div>

<style>
    .login-container {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        background: #222;
    }
    .card {
        background: white;
        padding: 2rem;
        border-radius: 8px;
        color: black;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        width: 300px;
    }
    input {
        padding: 8px;
        border: 1px solid #ccc;
        border-radius: 4px;
    }
    button {
        padding: 10px;
        background: #2563eb;
        color: white;
        border: none;
        cursor: pointer;
        border-radius: 4px;
        font-weight: bold;
    }
    button:hover {
        background: #1d4ed8;
    }
</style>
