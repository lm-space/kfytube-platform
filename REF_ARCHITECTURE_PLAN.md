# KfyTube Architecture Refactoring Plan

## Objective
Transition from a monolithic single-file Hono app to a modern, component-based **Vite + Svelte** architecture, splitting the application into a decoupled **Frontend** and **Backend**.

## 1. Directory Structure (Monorepo)
We will restructure the `kfytube` directory:

```text
kfytube/
├── backend/            # (Old Root) Hono Worker + D1 Database
│   ├── src/            # API Logic (index.ts)
│   ├── wrangler.json   # Worker Config
│   └── schema.sql      # Database Schema
├── frontend/           # (New) Vite + Svelte Application
│   ├── src/
│   │   ├── components/ # Reusable UI Components
│   │   ├── stores/     # State Management (Videos, Auth)
│   │   └── App.svelte  # Main Router/Layout
│   └── vite.config.ts  # Build Config (with API Proxy)
└── package.json        # Root scripts (e.g., "start:all")
```

## 2. Backend Strategy (Hono)
*   **Role**: Strict API Gateway.
*   **Changes**:
    *   Remove `LAYOUT`, `ADMIN_HTML`, and all HTML serving routes (`/`, `/admin`, `/watch/:id`).
    *   Keep and enhance `/api/*` endpoints.
    *   Ensure CORS is configured for the frontend.

## 3. Frontend Strategy (Svelte)
*   **Framework**: Vite + Svelte (TypeScript).
*   **State Management**: Svelte Stores (`writable`) for seamless state updates (replacing `refreshData()` calls).
*   **Routing**: Client-side routing (e.g., `svelte-routing` or simple conditional rendering if simple enough).
*   **UI Components**:
    *   `VideoCard.svelte`: For public/admin lists.
    *   `AdminSidebar.svelte`: Navigation.
    *   `VideoPlayer.svelte`: Custom wrapper for YouTube iframe.
    *   `SpatialNav.svelte`: Dedicated controller for TV-style navigation (d-pad).

## 4. Development Workflow
*   **Backend**: Runs on port `8787` (`wrangler dev`).
*   **Frontend**: Runs on port `5173` (`vite`).
*   **Proxy**: Vite will proxy `/api` requests to `http://localhost:8787` to avoid CORS issues during dev.

## 5. Execution Steps
1.  **Restructure**: Move current files to `backend/`.
2.  **Initialize**: Create `frontend` with Vite + Svelte.
3.  **Clean Backend**: Strip HTML code from `backend/src/index.ts`.
4.  **Build Frontend**: Port the existing Admin and Public HTML/JS logic into Svelte components.
5.  **Wire Up**: Connect Frontend to Backend API.
