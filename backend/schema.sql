DROP TABLE IF EXISTS videos;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS playlists;
DROP TABLE IF EXISTS playlist_items;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS admins;

CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  channel_name TEXT,
  magic_link_token TEXT,
  magic_link_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  channel_id INTEGER,
  is_global BOOLEAN DEFAULT 1,
  FOREIGN KEY (channel_id) REFERENCES users(id)
);

CREATE TABLE videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id TEXT NOT NULL,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_secs INTEGER,
  category_id INTEGER,
  display_order INTEGER DEFAULT 0,
  channel_id INTEGER,
  is_global BOOLEAN DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (channel_id) REFERENCES users(id),
  UNIQUE(youtube_id, category_id)
);

CREATE TABLE playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0,
  channel_id INTEGER,
  is_global BOOLEAN DEFAULT 1,
  FOREIGN KEY (channel_id) REFERENCES users(id)
);

CREATE TABLE playlist_items (
  playlist_id INTEGER,
  video_id INTEGER,
  sort_order INTEGER,
  PRIMARY KEY (playlist_id, video_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (video_id) REFERENCES videos(id)
);

-- Seed initial data
INSERT INTO users (email, channel_name) VALUES ('admin@kfytube.com', 'Admin Channel');
INSERT INTO categories (name, display_order, is_global) VALUES ('Educational', 1, 1), ('Cartoons', 2, 1), ('Music', 3, 1);
