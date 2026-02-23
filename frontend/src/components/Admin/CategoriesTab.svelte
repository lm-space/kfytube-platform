<script>
    import { onMount } from "svelte";
    import { categories, API_BASE, refreshData, token, getApiHeaders } from "../../lib/stores";
    let newName = "";
    let isGlobal = true;
    let newTenantIds = [0]; // Default to global tenant

    // Inline Edit State
    let editingId = null;
    let editName = "";

    // Tenant management
    let tenants = [];
    let showTenantModal = false;
    let selectedCategory = null;
    let selectedTenantIds = [];

    onMount(async () => {
        await loadTenants();
        await loadCategoriesWithTenants();
    });

    async function loadTenants() {
        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/tenants`, { headers });
            if (res.ok) {
                tenants = await res.json();
            }
        } catch (e) {
            console.error("Failed to load tenants", e);
        }
    }

    async function loadCategoriesWithTenants() {
        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/categories?all_tenants=1`, { headers });
            if (res.ok) {
                const data = await res.json();
                categories.set(data);
            }
        } catch (e) {
            console.error("Failed to load categories", e);
        }
    }

    function openTenantModal(cat) {
        selectedCategory = cat;
        selectedTenantIds = cat.tenant_ids || [0];
        showTenantModal = true;
    }

    function closeTenantModal() {
        showTenantModal = false;
        selectedCategory = null;
        selectedTenantIds = [];
    }

    function toggleTenant(tenantId) {
        if (selectedTenantIds.includes(tenantId)) {
            selectedTenantIds = selectedTenantIds.filter(id => id !== tenantId);
        } else {
            selectedTenantIds = [...selectedTenantIds, tenantId];
        }
    }

    function toggleNewTenant(tenantId) {
        if (newTenantIds.includes(tenantId)) {
            newTenantIds = newTenantIds.filter(id => id !== tenantId);
        } else {
            newTenantIds = [...newTenantIds, tenantId];
        }
    }

    async function saveTenants() {
        if (!selectedCategory) return;

        try {
            const headers = getApiHeaders();
            const res = await fetch(`${API_BASE}/categories/${selectedCategory.id}/tenants`, {
                method: "PUT",
                headers,
                body: JSON.stringify({ tenant_ids: selectedTenantIds })
            });

            if (res.ok) {
                await loadCategoriesWithTenants();
                closeTenantModal();
            } else {
                const err = await res.json();
                alert(err.error || "Failed to update tenants");
            }
        } catch (e) {
            console.error("Failed to update tenants", e);
        }
    }

    function getTenantName(tenantId) {
        if (tenantId === 0) return "Global (Default)";
        const tenant = tenants.find(t => t.id === tenantId);
        return tenant ? tenant.name : `Tenant ${tenantId}`;
    }

    async function create() {
        if (!newName) return;
        if (newTenantIds.length === 0) {
            alert("Please select at least one tenant/subdomain");
            return;
        }
        const headers = getApiHeaders();
        await fetch(API_BASE + "/categories", {
            method: "POST",
            headers,
            body: JSON.stringify({ name: newName, is_global: isGlobal, tenant_ids: newTenantIds }),
        });
        newName = "";
        isGlobal = true;
        newTenantIds = [0];
        await loadCategoriesWithTenants();
    }

    async function del(id) {
        if (
            !confirm(
                "Delete category? WARNING: All videos in this category will be PERMANENTLY DELETED.",
            )
        )
            return;
        await fetch(`${API_BASE}/categories/${id}`, {
            method: "DELETE",
            headers: {
                Authorization: `Bearer ${$token}`,
            },
        });
        refreshData();
    }

    async function move(id, dir) {
        let cats = [...$categories];
        const idx = cats.findIndex((c) => c.id === id);
        if (idx === -1) return;

        if (idx + dir < 0 || idx + dir >= cats.length) return;
        const temp = cats[idx];
        cats[idx] = cats[idx + dir];
        cats[idx + dir] = temp;

        // Optimistic update
        categories.set(cats);

        const updates = cats.map((c, i) => ({
            id: c.id,
            display_order: i + 1,
        }));
        await fetch(API_BASE + "/categories/reorder", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${$token}`,
            },
            body: JSON.stringify(updates),
        });
        refreshData();
    }

    function startEdit(cat) {
        editingId = cat.id;
        editName = cat.name;
        // Wait for DOM update
        setTimeout(() => {
            const el = document.getElementById(`edit-cat-${cat.id}`);
            if (el) el.focus();
        }, 0);
    }

    async function saveEdit(id) {
        if (!editName.trim()) return cancelEdit();

        const original = $categories.find((c) => c.id === id);
        if (original && original.name === editName) {
            cancelEdit();
            return;
        }

        await fetch(`${API_BASE}/categories/${id}`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${$token}`,
            },
            body: JSON.stringify({ name: editName }),
        });

        // Optimistic
        categories.update((all) =>
            all.map((c) => (c.id === id ? { ...c, name: editName } : c)),
        );
        cancelEdit();
    }

    function cancelEdit() {
        editingId = null;
        editName = "";
    }
    // DND
    let draggedItem = null;
    let dragOverItem = null;

    function handleDragStart(e, item) {
        draggedItem = item;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", JSON.stringify(item));
        setTimeout(() => e.target.classList.add("dragging"), 0);
    }

    function handleDragEnd(e) {
        e.target.classList.remove("dragging");
        draggedItem = null;
        dragOverItem = null;
    }

    function handleDragOver(e, item) {
        e.preventDefault();
        if (draggedItem === item) return;
        dragOverItem = item;
    }

    async function handleDrop(e, targetItem) {
        e.preventDefault();
        if (!draggedItem || draggedItem === targetItem) return;

        const all = [...$categories];
        const fromIndex = all.indexOf(draggedItem);
        const toIndex = all.indexOf(targetItem);

        if (fromIndex < 0 || toIndex < 0) return;

        all.splice(fromIndex, 1);
        all.splice(toIndex, 0, draggedItem);

        categories.set(all);
        await saveOrder(all);
        draggedItem = null;
        dragOverItem = null;
    }

    async function saveOrder(items) {
        const payload = items.map((c, idx) => ({
            id: c.id,
            display_order: idx,
        }));
        await fetch(`${API_BASE}/categories/reorder`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${$token}`,
            },
            body: JSON.stringify(payload),
        });
    }

    async function toggleFeatured(cat) {
        const newVal = cat.is_featured ? 0 : 1;
        const headers = getApiHeaders();
        await fetch(`${API_BASE}/categories/${cat.id}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ is_featured: newVal }),
        });
        // Optimistic update
        categories.update((all) =>
            all.map((c) => (c.id === cat.id ? { ...c, is_featured: newVal } : c)),
        );
    }

    async function toggleRepeat(cat) {
        const newVal = cat.repeat_enabled ? 0 : 1;
        const headers = getApiHeaders();
        await fetch(`${API_BASE}/categories/${cat.id}`, {
            method: "PUT",
            headers,
            body: JSON.stringify({ repeat_enabled: newVal }),
        });
        // Optimistic update
        categories.update((all) =>
            all.map((c) => (c.id === cat.id ? { ...c, repeat_enabled: newVal } : c)),
        );
    }

    function handleKeydown(e, id) {
        if (e.key === "Enter") saveEdit(id);
        if (e.key === "Escape") cancelEdit();
    }
</script>

<div class="total-banner">
    <span class="total-count">{$categories.length}</span>
    <span class="total-label">Total Categories</span>
</div>

<div class="card">
    <h2>Categories</h2>
    <div class="add-row">
        <input
            type="text"
            placeholder="New Category Name"
            bind:value={newName}
            on:keydown={(e) => e.key === "Enter" && create()}
        />
        <label title="Available to all channels" class="checkbox-label">
            <input type="checkbox" bind:checked={isGlobal} /> Global
        </label>
        <div class="tenant-selector">
            <span class="tenant-label">Subdomains:</span>
            <label class="tenant-checkbox">
                <input type="checkbox" checked={newTenantIds.includes(0)} on:change={() => toggleNewTenant(0)} />
                Global
            </label>
            {#each tenants as tenant}
                <label class="tenant-checkbox">
                    <input type="checkbox" checked={newTenantIds.includes(tenant.id)} on:change={() => toggleNewTenant(tenant.id)} />
                    {tenant.name}
                </label>
            {/each}
        </div>
        <button on:click={create}>Add</button>
    </div>

    <div class="list">
        {#each $categories as c (c.id)}
            <div
                class="item"
                draggable="true"
                on:dragstart={(e) => handleDragStart(e, c)}
                on:dragend={handleDragEnd}
                on:dragover={(e) => handleDragOver(e, c)}
                on:drop={(e) => handleDrop(e, c)}
            >
                {#if editingId === c.id}
                    <input
                        id="edit-cat-{c.id}"
                        type="text"
                        bind:value={editName}
                        on:blur={() => saveEdit(c.id)}
                        on:keydown={(e) => handleKeydown(e, c.id)}
                        class="edit-input"
                    />
                {:else}
                    <div class="name-row">
                        <div class="drag-handle">⋮⋮</div>
                        <span
                            on:click={() => startEdit(c)}
                            class="name"
                            title="Click to edit"
                        >
                            {c.name}
                        </span>
                        <button class="icon-btn" on:click={() => startEdit(c)}>✎</button>
                    </div>
                {/if}
                <div class="item-actions">
                    <div class="tenant-badges">
                        {#each (c.tenant_ids || []) as tid}
                            <span class="tenant-badge" class:global={tid === 0}>{getTenantName(tid)}</span>
                        {/each}
                    </div>
                    <button
                        class="btn-featured"
                        class:active={c.is_featured}
                        on:click={() => toggleFeatured(c)}
                        title={c.is_featured ? 'Remove from featured' : 'Mark as featured'}
                    >
                        {c.is_featured ? '★' : '☆'}
                    </button>
                    <button
                        class="btn-repeat"
                        class:active={c.repeat_enabled}
                        on:click={() => toggleRepeat(c)}
                        title={c.repeat_enabled ? 'Disable repeat' : 'Enable repeat'}
                    >
                        {c.repeat_enabled ? '🔁' : '→'}
                    </button>
                    <button class="btn-tenants" on:click={() => openTenantModal(c)}>Subdomains</button>
                    <button class="btn-danger" on:click={() => del(c.id)}>Delete</button>
                </div>
            </div>
        {/each}
    </div>
</div>

<!-- Tenant Assignment Modal -->
{#if showTenantModal && selectedCategory}
    <div class="modal-overlay" on:click={closeTenantModal}>
        <div class="modal" on:click|stopPropagation>
            <div class="modal-header">
                <h3>Assign Subdomains - {selectedCategory.name}</h3>
                <button class="close-btn" on:click={closeTenantModal}>&times;</button>
            </div>
            <div class="modal-body">
                <p class="modal-help">Select which subdomains this category should appear in:</p>
                <div class="tenant-list">
                    <label class="tenant-option">
                        <input type="checkbox" checked={selectedTenantIds.includes(0)} on:change={() => toggleTenant(0)} />
                        <span class="tenant-name">Global (Default)</span>
                        <span class="tenant-url">tube.twozao.com</span>
                    </label>
                    {#each tenants as tenant}
                        <label class="tenant-option">
                            <input type="checkbox" checked={selectedTenantIds.includes(tenant.id)} on:change={() => toggleTenant(tenant.id)} />
                            <span class="tenant-name">{tenant.name}</span>
                            <span class="tenant-url">{tenant.slug}.tube.twozao.com</span>
                        </label>
                    {/each}
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn-secondary" on:click={closeTenantModal}>Cancel</button>
                <button class="btn-primary" on:click={saveTenants}>Save</button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* Total Banner */
    .total-banner {
        background: linear-gradient(135deg, #ff9800, #f57c00);
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
        margin: 0 0 var(--space-lg) 0;
        font-size: 1.25rem;
        color: var(--admin-text);
        display: flex;
        align-items: center;
        gap: var(--space-sm);
    }

    h2::before {
        content: '📁';
    }

    /* Add Row */
    .add-row {
        display: flex;
        gap: var(--space-sm);
        margin-bottom: var(--space-xl);
        padding: var(--space-lg);
        background: var(--admin-bg);
        border-radius: var(--radius-md);
        border: 1px solid var(--admin-border);
        flex-wrap: wrap;
    }

    .add-row input[type="text"] {
        flex: 1;
        min-width: 200px;
        padding: var(--space-md);
        border: 1px solid var(--admin-border);
        border-radius: var(--radius-md);
        font-size: 0.875rem;
        transition: all var(--transition-fast);
    }

    .add-row input[type="text"]:focus {
        outline: none;
        border-color: var(--admin-primary);
        box-shadow: 0 0 0 3px var(--admin-primary-light);
    }

    .checkbox-label {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        font-size: 0.875rem;
        color: var(--admin-text-muted);
        white-space: nowrap;
    }

    .checkbox-label input[type="checkbox"] {
        accent-color: var(--admin-primary);
    }

    button {
        padding: var(--space-md) var(--space-lg);
        background: var(--admin-primary);
        color: white;
        border: none;
        border-radius: var(--radius-md);
        cursor: pointer;
        font-weight: 600;
        font-size: 0.875rem;
        transition: all var(--transition-fast);
    }

    button:hover {
        background: var(--admin-primary-hover);
        transform: translateY(-1px);
    }

    button:active {
        transform: translateY(0);
    }

    /* Category List */
    .list {
        display: flex;
        flex-direction: column;
    }

    .item {
        display: flex;
        justify-content: space-between;
        padding: var(--space-md) var(--space-lg);
        border-bottom: 1px solid var(--admin-border);
        align-items: center;
        background: white;
        transition: all var(--transition-fast);
    }

    .item:hover {
        background: var(--admin-bg);
    }

    .item:last-child {
        border-bottom: none;
    }

    .item.dragging {
        opacity: 0.5;
        background: var(--admin-primary-light);
        border: 2px dashed var(--admin-primary);
    }

    .btn-danger {
        background: var(--admin-danger) !important;
        padding: var(--space-sm) var(--space-md);
        font-size: 0.8rem;
    }

    .btn-danger:hover {
        background: #dc2626 !important;
    }

    .name-row {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        flex: 1;
        min-width: 0;
    }

    .drag-handle {
        cursor: grab;
        color: var(--admin-text-light);
        margin-right: var(--space-md);
        font-weight: bold;
        user-select: none;
        opacity: 0.5;
        transition: opacity var(--transition-fast);
    }

    .item:hover .drag-handle {
        opacity: 1;
    }

    .name {
        font-weight: 500;
        color: var(--admin-text);
        cursor: pointer;
        transition: color var(--transition-fast);
    }

    .name:hover {
        color: var(--admin-primary);
    }

    .edit-input {
        font-size: 0.875rem;
        padding: var(--space-sm);
        border: 2px solid var(--admin-primary);
        border-radius: var(--radius-sm);
        max-width: 300px;
    }

    .edit-input:focus {
        outline: none;
        box-shadow: 0 0 0 3px var(--admin-primary-light);
    }

    .icon-btn {
        background: none !important;
        border: none;
        padding: var(--space-xs);
        font-size: 1rem;
        cursor: pointer;
        color: var(--admin-text-light);
        transition: all var(--transition-fast);
        border-radius: var(--radius-sm);
        opacity: 0;
    }

    .item:hover .icon-btn {
        opacity: 1;
    }

    .icon-btn:hover {
        color: var(--admin-primary) !important;
        background: var(--admin-primary-light) !important;
        transform: none;
    }

    /* Responsive */
    @media (max-width: 768px) {
        .card {
            padding: var(--space-lg);
        }

        .add-row {
            flex-direction: column;
            padding: var(--space-md);
        }

        .add-row input[type="text"] {
            min-width: 100%;
        }

        .add-row button {
            width: 100%;
        }

        .item {
            flex-direction: column;
            align-items: stretch;
            gap: var(--space-md);
            padding: var(--space-md);
        }

        .btn-danger {
            width: 100%;
        }

        .icon-btn {
            opacity: 1;
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

    /* Tenant Selector in Add Row */
    .tenant-selector {
        display: flex;
        flex-wrap: wrap;
        gap: var(--space-sm);
        align-items: center;
        padding: var(--space-sm) 0;
    }

    .tenant-label {
        font-size: 0.875rem;
        color: var(--admin-text-muted);
        font-weight: 500;
    }

    .tenant-checkbox {
        display: flex;
        align-items: center;
        gap: var(--space-xs);
        font-size: 0.8rem;
        color: var(--admin-text);
        background: var(--admin-card);
        padding: var(--space-xs) var(--space-sm);
        border-radius: var(--radius-sm);
        border: 1px solid var(--admin-border);
        cursor: pointer;
    }

    .tenant-checkbox:hover {
        border-color: var(--admin-primary);
    }

    /* Item Actions */
    .item-actions {
        display: flex;
        align-items: center;
        gap: var(--space-sm);
        flex-wrap: wrap;
    }

    .tenant-badges {
        display: flex;
        gap: var(--space-xs);
        flex-wrap: wrap;
    }

    .tenant-badge {
        background: var(--admin-primary-light);
        color: var(--admin-primary);
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 0.7rem;
        font-weight: 500;
    }

    .tenant-badge.global {
        background: #dcfce7;
        color: #166534;
    }

    .btn-featured {
        background: none !important;
        border: 1px solid var(--admin-border) !important;
        padding: var(--space-sm) var(--space-md);
        font-size: 1.1rem;
        color: #ccc;
        cursor: pointer;
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
    }

    .btn-featured:hover {
        color: #f59e0b;
        border-color: #f59e0b !important;
        transform: none;
    }

    .btn-featured.active {
        color: #f59e0b;
        background: #fef3c7 !important;
        border-color: #f59e0b !important;
    }

    .btn-repeat {
        background: none !important;
        border: 1px solid var(--admin-border) !important;
        padding: var(--space-sm) var(--space-md);
        font-size: 1.1rem;
        color: #ccc;
        cursor: pointer;
        border-radius: var(--radius-md);
        transition: all var(--transition-fast);
    }

    .btn-repeat:hover {
        color: #10b981;
        border-color: #10b981 !important;
        transform: none;
    }

    .btn-repeat.active {
        color: #10b981;
        background: #d1fae5 !important;
        border-color: #10b981 !important;
    }

    .btn-tenants {
        background: #f59e0b !important;
        padding: var(--space-sm) var(--space-md);
        font-size: 0.8rem;
    }

    .btn-tenants:hover {
        background: #d97706 !important;
    }

    /* Modal Styles */
    .modal-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
    }

    .modal {
        background: white;
        border-radius: var(--radius-lg);
        width: 90%;
        max-width: 500px;
        max-height: 80vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
    }

    .modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: var(--space-lg);
        border-bottom: 1px solid var(--admin-border);
    }

    .modal-header h3 {
        margin: 0;
        font-size: 1.1rem;
    }

    .close-btn {
        background: none !important;
        border: none;
        font-size: 1.5rem;
        color: var(--admin-text-light);
        cursor: pointer;
        padding: 0;
        line-height: 1;
    }

    .close-btn:hover {
        color: var(--admin-text);
        transform: none;
    }

    .modal-body {
        padding: var(--space-lg);
        overflow-y: auto;
        flex: 1;
    }

    .modal-help {
        color: var(--admin-text-muted);
        font-size: 0.9rem;
        margin: 0 0 var(--space-md) 0;
    }

    .tenant-list {
        display: flex;
        flex-direction: column;
        gap: var(--space-sm);
    }

    .tenant-option {
        display: flex;
        align-items: center;
        gap: var(--space-md);
        padding: var(--space-md);
        background: var(--admin-bg);
        border-radius: var(--radius-md);
        cursor: pointer;
        border: 1px solid transparent;
        transition: all var(--transition-fast);
    }

    .tenant-option:hover {
        border-color: var(--admin-primary);
    }

    .tenant-option input[type="checkbox"] {
        width: 18px;
        height: 18px;
        accent-color: var(--admin-primary);
    }

    .tenant-name {
        font-weight: 500;
        color: var(--admin-text);
        flex: 1;
    }

    .tenant-url {
        font-size: 0.8rem;
        color: var(--admin-text-muted);
        font-family: monospace;
    }

    .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: var(--space-sm);
        padding: var(--space-lg);
        border-top: 1px solid var(--admin-border);
    }

    .btn-secondary {
        background: var(--admin-bg) !important;
        color: var(--admin-text) !important;
        border: 1px solid var(--admin-border) !important;
    }

    .btn-secondary:hover {
        background: var(--admin-border) !important;
    }

    .btn-primary {
        background: var(--admin-primary) !important;
    }
</style>
