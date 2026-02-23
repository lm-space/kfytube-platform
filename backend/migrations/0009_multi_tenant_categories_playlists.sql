-- Migration: Add junction tables for multi-tenant categories and playlists
-- Categories and playlists can now belong to multiple tenants

-- Junction table for category-tenant relationships
CREATE TABLE IF NOT EXISTS category_tenants (
    category_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    PRIMARY KEY (category_id, tenant_id),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Junction table for playlist-tenant relationships
CREATE TABLE IF NOT EXISTS playlist_tenants (
    playlist_id INTEGER NOT NULL,
    tenant_id INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, tenant_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE
);

-- Migrate existing category tenant assignments to junction table
INSERT OR IGNORE INTO category_tenants (category_id, tenant_id)
SELECT id, COALESCE(tenant_id, 0) FROM categories WHERE tenant_id IS NOT NULL;

-- Migrate existing playlist tenant assignments to junction table
INSERT OR IGNORE INTO playlist_tenants (playlist_id, tenant_id)
SELECT id, COALESCE(tenant_id, 0) FROM playlists WHERE tenant_id IS NOT NULL;

-- Create indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_category_tenants_category ON category_tenants(category_id);
CREATE INDEX IF NOT EXISTS idx_category_tenants_tenant ON category_tenants(tenant_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tenants_playlist ON playlist_tenants(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_tenants_tenant ON playlist_tenants(tenant_id);
