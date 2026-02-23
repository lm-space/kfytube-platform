# KfyTube - Functional Specification

## 1. Project Overview
"Kids Friendly Youtube" (KfyTube) is a web application designed primarily for Smart TVs and large screens. Its core purpose is to provide a safe, distraction-free environment for children to watch curated YouTube content.

## 2. Key Objectives
- **Safety**: No open search. Users can only watch videos explicitly added by the admin.
- **TV-First Experience**: Interface optimized for remote control navigation (Arrow keys, Enter, Back).
- **Performance**: Extremely lightweight frontend to ensure smooth operation on low-power TV browsers.
- **Focus**: No "related videos" or algorithmic recommendations to prevent "rabbit hole" surfing.

## 3. User Interface (TV Application)
### 3.1. Navigation
- **Input Method**: Spatial Navigation (Up, Down, Left, Right, Enter, Back).
- **Focus State**: Highly visible focus indicators (borders, scaling) to show the currently selected element.

### 3.2. Screens
#### Home Screen
- **Sidebar/Top Bar**: List of Categories (e.g., "Cartoons", "Educational", "Songs") and Playlists.
- **Content Area**: Grid of video thumbnails for the selected category.
- **Interaction**:
    - Navigating to a video and pressing "Enter" opens the Player.

#### Player Screen
- **Layout**: Fullscreen video player.
- **Mechanism**: YouTube IFrame API.
- **Controls**:
    - Play/Pause (Enter).
    - Back to List (Back/Escape).
- **Restrictions**:
    - `rel=0` (approximate, as YouTube changed this, we must ensure UI hides suggestions or we stop playback).
    - No external links or "Watch on YouTube" buttons if possible.

## 4. Admin Interface (Management Portal)
A protected web interface for parents/admins to manage content.

### 4.1. Authentication
- Simple password protection or secure login session.

### 4.2. Features
- **Dashboard**: Overview of total videos/categories.
- **Category Management**: Create, Edit, Delete categories.
- **Video Management**:
    - **Import**: Paste a YouTube URL (single or playlist).
    - **Metadata Fetching**: Automatically fetch Title, Thumbnail, and Duration from YouTube API (or oEmbed).
    - **Assignment**: Assign videos to Categories.
    - **Inline Edit**: Ability to change category of a video directly from the list view.
- **Playlist Management**: Create custom ordered lists of videos.
- **User Management**:
    - Invite new admins via email (Magic Link login).
    - Manage "Channel" settings (Name, Password).

## 5. Multi-Channel Architecture
To support multiple users/creators with distinct content views:
- **Channels**: Each admin user has a personal "Channel" (default name: first 4 chars of email).
- **Content Visibility**:
    - **Global Content**: Available to ALL channels.
    - **Channel Content**: Private to the specific channel.
- **Public View**:
    - Default: Shows Global content.
    - Channel Selector: Users can select a channel to view that specific user's curated content.
- **Data Isolation**:
    - Importing/Creating items has a "Global" toggle.
    - If "Global" is OFF, the item is linked to the Creator's Channel ID.

## 5. Technical Architecture
### 5.1. Stack
- **Platform**: Cloudflare Pages + Functions (Advanced mode).
- **Database**: Cloudflare D1 (SQLite).
- **Frontend**: Preact (via Vite) for minimal bundle size.
- **Styling**: Vanilla CSS or Tailwind (if requested, but sticking to simple CSS for speed).

### 6.2. Database Schema (Updated)
- `users`: id, email, channel_name, magic_link_token, magic_link_expires, created_at
- `categories`: id, name, display_order, channel_id (nullable), is_global (bool)
- `videos`: id, youtube_id, title, thumbnail_url, duration, category_id, display_order, channel_id (nullable), is_global (bool)
- `playlists`: id, name, display_order, channel_id (nullable), is_global (bool)
- `playlist_items`: playlist_id, video_id, sort_order

## 6. Constraints & Requirements
- **No Search**: The user interface must NOT have a search bar.
- **Performance**: "Very fast." Avoid heavy frameworks.
## 7. Future Roadmap

### 7.1. "Social Drop" - Easy Content Push
**Goal**: Allow admins to push videos to the platform directly from social apps (Telegram/WhatsApp) without logging into the dashboard.

**Proposed Workflow (Telegram Bot):**
1.  **Setup**: Admin authenticates with a `KfyTube Bot` on Telegram, linking their Telegram ID to their KfyTube Channel.
2.  **Action**: Admin shares a link (YouTube, Instagram, TikTok) to the bot chat.
3.  **Categorization**:
    - *Auto*: Bot attempts to match category based on words in the caption (e.g. "math" -> "Education").
    - *Default*: If no match, assigns to "Uncategorized" (displayed as "Other").
4.  **Confirmation**: Bot replies with "✅ Video Saved to [Category Name]".
5.  **Smart Features**:
    - Support for multiple links at once.
    - Commands like `/cat [name]` to set the target category for subsequent links.

**Why Telegram?**
- Open API with easy bot creation.
- Native "Share to..." functionality on mobile.
- Persistent history of what was added.
