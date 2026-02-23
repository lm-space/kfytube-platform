import { writable, derived } from 'svelte/store';

export const token = writable(localStorage.getItem('token') || '');
export const videos = writable<any[]>([]);
export const categories = writable<any[]>([]);
export const playlists = writable<any[]>([]);

// User profile name (stored in localStorage for anonymous users)
export const userName = writable(localStorage.getItem('userName') || '');
userName.subscribe((val) => {
    if (val) localStorage.setItem('userName', val);
    else localStorage.removeItem('userName');
});

token.subscribe((val) => {
    if (val) localStorage.setItem('token', val);
    else localStorage.removeItem('token');
});

export const API_BASE = import.meta.env.DEV ? '/api' : 'https://tube-api.twozao.com/api';

// --- TENANT DETECTION ---
// Detects tenant slug from subdomain: learn.tube.twozao.com -> 'learn'
// Or from query param: ?tenant=learn
// For local dev: localhost:5173?tenant=learn or learn.tube.local

export function getTenantSlug(): string | null {
    // 1. Check query param first (useful for testing)
    const urlParams = new URLSearchParams(window.location.search);
    const queryTenant = urlParams.get('tenant');
    if (queryTenant) return queryTenant;

    const host = window.location.hostname;

    // 2. Production: *.tube.twozao.com
    const prodMatch = host.match(/^([^.]+)\.tube\.twozao\.com$/);
    if (prodMatch && prodMatch[1] !== 'www') {
        return prodMatch[1];
    }

    // 3. Local dev: *.tube.local
    const localMatch = host.match(/^([^.]+)\.tube\.local$/);
    if (localMatch && localMatch[1] !== 'www') {
        return localMatch[1];
    }

    // 4. No tenant (global)
    return null;
}

// Store for current tenant
export const tenantSlug = writable<string | null>(getTenantSlug());
export const tenantInfo = writable<any>(null);

// Helper to get headers with tenant
export function getApiHeaders(): HeadersInit {
    const slug = getTenantSlug();
    const t = localStorage.getItem('token');
    const headers: HeadersInit = {
        'Content-Type': 'application/json'
    };
    if (slug) {
        headers['X-Tenant-Slug'] = slug;
    }
    if (t) {
        headers['Authorization'] = `Bearer ${t}`;
    }
    return headers;
}

// For public API calls - NO auth header to ensure visibility filtering works
export function getPublicApiHeaders(): HeadersInit {
    const slug = getTenantSlug();
    const headers: HeadersInit = {
        'Content-Type': 'application/json'
    };
    if (slug) {
        headers['X-Tenant-Slug'] = slug;
    }
    // NOTE: Deliberately NOT including Authorization header for public APIs
    // This ensures unauthenticated users see only visible videos
    return headers;
}

// Fetch with tenant header
export async function fetchWithTenant(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = {
        ...getApiHeaders(),
        ...(options.headers || {})
    };
    return fetch(url, { ...options, headers });
}

export async function refreshData() {
    const t = localStorage.getItem('token');
    // Public access allowed
    // if (!t) return;

    try {
        const headers = getApiHeaders();
        const [vRes, cRes, pRes] = await Promise.all([
            fetch(`${API_BASE}/videos`, { headers }),
            fetch(`${API_BASE}/categories`, { headers }),
            fetch(`${API_BASE}/playlists`, { headers })
        ]);

        if (vRes.ok) videos.set(await vRes.json());
        if (cRes.ok) categories.set(await cRes.json());
        if (pRes.ok) playlists.set(await pRes.json());
    } catch (e) {
        console.error("Failed to fetch data", e);
    }
}

// Fetch tenant info on load
export async function loadTenantInfo() {
    const slug = getTenantSlug();
    if (slug) {
        try {
            const res = await fetchWithTenant(`${API_BASE}/tenant-info`);
            if (res.ok) {
                const info = await res.json();
                tenantInfo.set(info);
            }
        } catch (e) {
            console.error("Failed to fetch tenant info", e);
        }
    }
}
