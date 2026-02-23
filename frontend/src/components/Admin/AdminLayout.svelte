<script lang="ts">
    import { token, refreshData } from "../../lib/stores";
    import Login from "./Login.svelte";
    import Dashboard from "./Dashboard.svelte";
    import { onMount } from "svelte";

    onMount(() => {
        if ($token) refreshData();
    });
</script>

<svelte:head>
    <title>Tube App Admin</title>
</svelte:head>

{#if !$token}
    <Login />
{:else}
    <Dashboard />
{/if}
