<script lang="ts">
  import { onMount } from "svelte";
  import AdminLayout from "./components/Admin/AdminLayout.svelte";
  import PublicLayout from "./components/Public/PublicLayout.svelte";
  import WatchPage from "./components/Public/WatchPage.svelte";
  import YouTubeLayout from "./components/Public/YouTubeLayout.svelte";
  import YouTubeWatchPage from "./components/Public/YouTubeWatchPage.svelte";
  import YouTubeShortsPage from "./components/Public/YouTubeShortsPage.svelte";

  let currentPath = window.location.pathname;

  function handlePopState() {
    currentPath = window.location.pathname;
  }
  console.log("APP VERSION: UPDATE_V6_YOUTUBE_MODE");
</script>

<svelte:window on:popstate={handlePopState} />

{#if currentPath.startsWith("/admin") || currentPath.startsWith("/login")}
  <AdminLayout />
{:else if currentPath.startsWith("/watch")}
  <WatchPage />
{:else if currentPath.startsWith("/yt-watch")}
  <YouTubeWatchPage />
{:else if currentPath.startsWith("/yt-shorts")}
  <YouTubeShortsPage />
{:else if currentPath.startsWith("/categories")}
  <PublicLayout />
{:else}
  <YouTubeLayout />
{/if}

<style>
  :global(body) {
    margin: 0;
    font-family: "Inter", sans-serif;
    background: #1a1a1a;
    color: white;
  }
</style>
