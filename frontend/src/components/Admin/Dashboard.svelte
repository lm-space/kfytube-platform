<script>
    import { onMount } from "svelte";
    import VideosTab from "./VideosTab.svelte";
    import CategoriesTab from "./CategoriesTab.svelte";
    import PlaylistsTab from "./PlaylistsTab.svelte";
    import UsersTab from "./UsersTab.svelte";
    import ProfileTab from "./ProfileTab.svelte";
    import TenantsTab from "./TenantsTab.svelte";
    import AutoImportTab from "./AutoImportTab.svelte";
    import VisibilityTab from "./VisibilityTab.svelte";
    import ImportLogsTab from "./ImportLogsTab.svelte";
    import SafetyTab from "./SafetyTab.svelte";
    import { API_BASE, token } from "../../lib/stores";

    let activeTab = "videos";
    let user = null;
    let sidebarCollapsed = false;
    let mobileMenuOpen = false;

    onMount(async () => {
        // Fetch User Info
        try {
            const res = await fetch(`${API_BASE}/me`, {
                headers: {
                    Authorization: `Bearer ${$token}`,
                },
            });
            if (res.ok) {
                user = await res.json();
            }
        } catch (e) {
            console.error(e);
        }

        const url = new URL(window.location.href);
        const tab = url.searchParams.get("tab");
        if (
            tab &&
            ["videos", "categories", "playlists", "users", "tenants", "autoimport", "visibility", "import-logs", "safety", "profile"].includes(
                tab,
            )
        ) {
            activeTab = tab;
        }

        // Check saved sidebar state
        const savedCollapsed = localStorage.getItem('sidebarCollapsed');
        if (savedCollapsed) sidebarCollapsed = savedCollapsed === 'true';
    });

    function setTab(tab) {
        activeTab = tab;
        mobileMenuOpen = false;
        const url = new URL(window.location.href);
        url.searchParams.set("tab", tab);
        window.history.pushState({}, "", url);
    }

    function toggleSidebar() {
        sidebarCollapsed = !sidebarCollapsed;
        localStorage.setItem('sidebarCollapsed', sidebarCollapsed.toString());
    }

    function logout() {
        if (confirm("Are you sure you want to sign out?")) {
            token.set(null);
            window.location.href = "/";
        }
    }

    const navItems = [
        { id: 'videos', label: 'Videos', icon: '🎬' },
        { id: 'categories', label: 'Categories', icon: '📁' },
        { id: 'playlists', label: 'Playlists', icon: '📺' },
        { id: 'visibility', label: 'Visibility', icon: '👁️' },
        { id: 'import-logs', label: 'Import Logs', icon: '📋' },
        { id: 'safety', label: 'Content Safety', icon: '🛡️' },
    ];

    $: adminItems = user && (user.id == 1 || user.email === "admin@kfytube.com")
        ? [
            { id: 'autoimport', label: 'Auto Import', icon: '🔄' },
            { id: 'users', label: 'Users', icon: '👥' },
            { id: 'tenants', label: 'Subdomains', icon: '🏠' }
          ]
        : [];

    const bottomItems = [
        { id: 'profile', label: 'Profile', icon: '⚙️' },
    ];
</script>

<div class="dashboard" class:sidebar-collapsed={sidebarCollapsed}>
    <!-- Mobile Header -->
    <header class="mobile-header">
        <button class="menu-toggle" on:click={() => mobileMenuOpen = !mobileMenuOpen}>
            {mobileMenuOpen ? '✕' : '☰'}
        </button>
        <span class="mobile-title">
            {navItems.find(i => i.id === activeTab)?.label ||
             adminItems.find(i => i.id === activeTab)?.label ||
             bottomItems.find(i => i.id === activeTab)?.label || 'Dashboard'}
        </span>
        <button class="mobile-logout" on:click={logout}>↪</button>
    </header>

    <!-- Sidebar -->
    <aside class:collapsed={sidebarCollapsed} class:mobile-open={mobileMenuOpen}>
        <div class="sidebar-header">
            <div class="brand">
                <span class="brand-icon">📺</span>
                {#if !sidebarCollapsed}
                    <span class="brand-text">Tube Admin</span>
                {/if}
            </div>
            <button class="collapse-btn desktop-only" on:click={toggleSidebar}>
                {sidebarCollapsed ? '→' : '←'}
            </button>
        </div>

        <nav>
            <div class="nav-section">
                {#if !sidebarCollapsed}
                    <span class="nav-label">Content</span>
                {/if}
                {#each navItems as item}
                    <button
                        class="nav-item"
                        class:active={activeTab === item.id}
                        on:click={() => setTab(item.id)}
                        title={sidebarCollapsed ? item.label : ''}
                    >
                        <span class="nav-icon">{item.icon}</span>
                        {#if !sidebarCollapsed}
                            <span class="nav-text">{item.label}</span>
                        {/if}
                    </button>
                {/each}
            </div>

            {#if adminItems.length > 0}
                <div class="nav-section">
                    {#if !sidebarCollapsed}
                        <span class="nav-label">Admin</span>
                    {/if}
                    {#each adminItems as item}
                        <button
                            class="nav-item"
                            class:active={activeTab === item.id}
                            on:click={() => setTab(item.id)}
                            title={sidebarCollapsed ? item.label : ''}
                        >
                            <span class="nav-icon">{item.icon}</span>
                            {#if !sidebarCollapsed}
                                <span class="nav-text">{item.label}</span>
                            {/if}
                        </button>
                    {/each}
                </div>
            {/if}
        </nav>

        <div class="sidebar-footer">
            {#each bottomItems as item}
                <button
                    class="nav-item"
                    class:active={activeTab === item.id}
                    on:click={() => setTab(item.id)}
                    title={sidebarCollapsed ? item.label : ''}
                >
                    <span class="nav-icon">{item.icon}</span>
                    {#if !sidebarCollapsed}
                        <span class="nav-text">{item.label}</span>
                    {/if}
                </button>
            {/each}

            {#if !sidebarCollapsed}
                <div class="user-info">
                    <div class="user-avatar">
                        {user?.channel_name?.[0]?.toUpperCase() || user?.email?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div class="user-details">
                        <span class="user-name">{user?.channel_name || 'User'}</span>
                        <span class="user-email">{user?.email || ''}</span>
                    </div>
                </div>
            {/if}

            <button class="nav-item logout-btn" on:click={logout} title={sidebarCollapsed ? 'Sign Out' : ''}>
                <span class="nav-icon">↪</span>
                {#if !sidebarCollapsed}
                    <span class="nav-text">Sign Out</span>
                {/if}
            </button>

            <a href="/" target="_blank" class="view-site" title={sidebarCollapsed ? 'View Site' : ''}>
                <span class="nav-icon">🌐</span>
                {#if !sidebarCollapsed}
                    <span class="nav-text">View Site</span>
                {/if}
            </a>
        </div>
    </aside>

    <!-- Mobile Overlay -->
    {#if mobileMenuOpen}
        <div class="mobile-overlay" on:click={() => mobileMenuOpen = false}></div>
    {/if}

    <!-- Main Content -->
    <main>
        <div class="content-wrapper">
            {#if activeTab === "videos"}
                <VideosTab />
            {:else if activeTab === "categories"}
                <CategoriesTab />
            {:else if activeTab === "playlists"}
                <PlaylistsTab />
            {:else if activeTab === "visibility"}
                <VisibilityTab />
            {:else if activeTab === "import-logs"}
                <ImportLogsTab />
            {:else if activeTab === "safety" && user && (user.id == 1 || user.email === "admin@kfytube.com")}
                <SafetyTab />
            {:else if activeTab === "users" && user && (user.id == 1 || user.email === "admin@kfytube.com")}
                <UsersTab />
            {:else if activeTab === "tenants" && user && (user.id == 1 || user.email === "admin@kfytube.com")}
                <TenantsTab />
            {:else if activeTab === "autoimport" && user && (user.id == 1 || user.email === "admin@kfytube.com")}
                <AutoImportTab />
            {:else if activeTab === "profile"}
                <ProfileTab />
            {/if}
        </div>
    </main>
</div>

<style>
    .dashboard {
        display: flex;
        height: 100vh;
        background: var(--admin-bg);
        color: var(--admin-text);
        overflow: hidden;
    }

    /* Sidebar */
    aside {
        width: var(--sidebar-width);
        background: var(--admin-sidebar);
        color: white;
        display: flex;
        flex-direction: column;
        transition: width var(--transition-normal);
        z-index: 100;
        flex-shrink: 0;
    }

    aside.collapsed {
        width: var(--sidebar-collapsed);
    }

    .sidebar-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: var(--space-lg);
        border-bottom: 1px solid rgba(255,255,255,0.1);
    }

    .brand {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
    }

    .brand-icon {
        font-size: 1.5rem;
    }

    .brand-text {
        font-size: 1.1rem;
        font-weight: 600;
        color: var(--admin-primary);
        white-space: nowrap;
    }

    .collapse-btn {
        background: rgba(255,255,255,0.1);
        border: none;
        color: var(--admin-text-light);
        width: 28px;
        height: 28px;
        border-radius: var(--radius-sm);
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: all var(--transition-fast);
    }

    .collapse-btn:hover {
        background: rgba(255,255,255,0.2);
        color: white;
    }

    /* Navigation */
    nav {
        flex: 1;
        padding: var(--space-md);
        overflow-y: auto;
    }

    .nav-section {
        margin-bottom: var(--space-lg);
    }

    .nav-label {
        display: block;
        font-size: 0.7rem;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--admin-text-light);
        padding: var(--space-sm) var(--space-md);
        margin-bottom: var(--space-xs);
    }

    .nav-item {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        width: 100%;
        padding: var(--space-md);
        background: none;
        border: none;
        color: var(--admin-text-light);
        cursor: pointer;
        text-decoration: none;
        font-size: 0.95rem;
        border-radius: var(--radius-md);
        margin-bottom: var(--space-xs);
        transition: all var(--transition-fast);
        text-align: left;
    }

    .nav-item:hover {
        background: var(--admin-sidebar-hover);
        color: white;
    }

    .nav-item.active {
        background: var(--admin-primary);
        color: white;
    }

    .nav-icon {
        font-size: 1.1rem;
        width: 24px;
        text-align: center;
        flex-shrink: 0;
    }

    .nav-text {
        white-space: nowrap;
        overflow: hidden;
    }

    /* Sidebar Footer */
    .sidebar-footer {
        padding: var(--space-md);
        border-top: 1px solid rgba(255,255,255,0.1);
    }

    .user-info {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        padding: var(--space-md);
        margin-bottom: var(--space-sm);
        background: rgba(255,255,255,0.05);
        border-radius: var(--radius-md);
    }

    .user-avatar {
        width: 36px;
        height: 36px;
        background: var(--admin-primary);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 600;
        font-size: 0.9rem;
        flex-shrink: 0;
    }

    .user-details {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }

    .user-name {
        font-weight: 500;
        font-size: 0.9rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .user-email {
        font-size: 0.75rem;
        color: var(--admin-text-light);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .logout-btn {
        color: #f87171 !important;
    }

    .logout-btn:hover {
        background: rgba(239, 68, 68, 0.2) !important;
    }

    .view-site {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        width: 100%;
        padding: var(--space-md);
        color: var(--admin-primary);
        text-decoration: none;
        font-size: 0.95rem;
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
    }

    .view-site:hover {
        background: rgba(59, 130, 246, 0.1);
    }

    /* Main Content */
    main {
        flex: 1;
        overflow-y: auto;
        padding: var(--space-xl);
        min-width: 0;
    }

    .content-wrapper {
        max-width: 1400px;
        margin: 0 auto;
    }

    /* Mobile Header */
    .mobile-header {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        height: 56px;
        background: var(--admin-sidebar);
        color: white;
        align-items: center;
        justify-content: space-between;
        padding: 0 var(--space-md);
        z-index: 200;
    }

    .menu-toggle, .mobile-logout {
        background: none;
        border: none;
        color: white;
        font-size: 1.25rem;
        cursor: pointer;
        padding: var(--space-sm);
    }

    .mobile-title {
        font-weight: 600;
        font-size: 1rem;
    }

    .mobile-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 99;
    }

    /* Responsive */
    @media (max-width: 1024px) {
        main {
            padding: var(--space-lg);
        }
    }

    @media (max-width: 768px) {
        .mobile-header {
            display: flex;
        }

        .desktop-only {
            display: none !important;
        }

        aside {
            position: fixed;
            top: 0;
            left: 0;
            bottom: 0;
            width: 280px;
            transform: translateX(-100%);
            transition: transform var(--transition-normal);
        }

        aside.mobile-open {
            transform: translateX(0);
        }

        aside.collapsed {
            width: 280px;
        }

        .mobile-overlay {
            display: block;
        }

        main {
            padding: var(--space-md);
            padding-top: calc(56px + var(--space-md));
        }

        .content-wrapper {
            max-width: 100%;
        }

        /* Force sidebar to show all elements when mobile */
        aside .nav-text,
        aside .brand-text,
        aside .user-info,
        aside .nav-label {
            display: block !important;
        }
    }

    @media (max-width: 480px) {
        main {
            padding: var(--space-sm);
            padding-top: calc(56px + var(--space-sm));
        }
    }
</style>
