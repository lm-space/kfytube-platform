CREATE TABLE telegram_debug_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sender TEXT,
    payload TEXT
);
