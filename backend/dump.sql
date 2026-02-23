PRAGMA defer_foreign_keys=TRUE;
CREATE TABLE IF NOT EXISTS "admins_backup_pre_migration" (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  session_token TEXT
);
INSERT INTO "admins_backup_pre_migration" VALUES(1,'admin','password',NULL);
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  display_order INTEGER DEFAULT 0
, channel_id INTEGER, is_global BOOLEAN DEFAULT 1);
INSERT INTO "categories" VALUES(1,'Educational',1,1,1);
INSERT INTO "categories" VALUES(2,'Cartoons',2,1,1);
INSERT INTO "categories" VALUES(3,'Music',3,1,1);
INSERT INTO "categories" VALUES(4,'Kids',4,1,1);
INSERT INTO "categories" VALUES(5,'English',5,1,1);
INSERT INTO "categories" VALUES(6,'Nature',6,1,1);
INSERT INTO "categories" VALUES(7,'Funny',0,1,1);
INSERT INTO "categories" VALUES(8,'God',7,NULL,1);
INSERT INTO "categories" VALUES(9,'Justlikethat',0,1,1);
INSERT INTO "categories" VALUES(10,'Drawing',0,1,1);
CREATE TABLE videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  youtube_id TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  thumbnail_url TEXT,
  duration_secs INTEGER,
  category_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, display_order INTEGER DEFAULT 0, channel_id INTEGER, is_global BOOLEAN DEFAULT 1, source_type TEXT DEFAULT 'youtube',
  FOREIGN KEY (category_id) REFERENCES categories(id)
);
INSERT INTO "videos" VALUES(1,'w36yxLgwUOc','SOLAR SYSTEM - The Dr. Binocs Show | Best Learning Videos For Kids | Peekaboo Kidz',NULL,NULL,1,'2026-01-09 22:25:36',1,1,1,'youtube');
INSERT INTO "videos" VALUES(2,'NrX9To4bjFk','Learn to Count with Max the Glow Train and Team | The Amazing Water Adventure',NULL,NULL,4,'2026-01-09 22:41:38',0,1,1,'youtube');
INSERT INTO "videos" VALUES(3,'QahSR-a6raQ','100 Action Verbs in English With Sentences |First Words for Babies |English Vocabulary for Beginners',NULL,NULL,5,'2026-01-09 22:42:38',0,1,1,'youtube');
INSERT INTO "videos" VALUES(4,'ammw6GG2AXw','Learn Science |  Preschool Learning Videos | Rob The Robot',NULL,NULL,1,'2026-01-09 22:43:45',4,1,1,'youtube');
INSERT INTO "videos" VALUES(5,'ndDpjT0_IM0','How Your Brain Works? - The Dr. Binocs Show | Best Learning Videos For Kids | Peekaboo Kidz',NULL,NULL,1,'2026-01-09 22:43:57',3,1,1,'youtube');
INSERT INTO "videos" VALUES(6,'zkCKx3fpk4Q','4k video ultra hd solar system | space travel in (sun) moon and mars earth',NULL,NULL,1,'2026-01-09 22:44:57',2,1,1,'youtube');
INSERT INTO "videos" VALUES(7,'tRaMUeBkJmU','UNIVERSE in 8K HDR: Earth, Space & Beyond',NULL,NULL,1,'2026-01-09 22:45:23',0,1,1,'youtube');
INSERT INTO "videos" VALUES(8,'6yQH9jUqttE','China in 4K - Incredible Scenes & Uncovering Hidden Gems',NULL,NULL,6,'2026-01-09 22:46:28',0,1,1,'youtube');
INSERT INTO "videos" VALUES(9,'ssAbGah_Hv4','100 Tamil words',NULL,NULL,5,'2026-01-09 22:46:51',0,1,1,'youtube');
INSERT INTO "videos" VALUES(10,'ctQfCUY1CdA','Meet the Animals 44 min | Shark, Alligator, Cheetah, Fox, Bear, Gorilla | Educational Videos',NULL,NULL,4,'2026-01-10 02:38:26',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(15,'39ColarOWKo','Funniest Animal Videos Ever (Part 1)',NULL,NULL,7,'2026-01-10 16:50:06',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(16,'-oG547iZkyg','💀100% Funny Video Fails - Try Not To Laugh Funny Videos',NULL,NULL,7,'2026-01-10 16:52:42',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(17,'8PHbr2m7auo','ULTIMATE Baby Funny Moments: 1 Hour of Cutest Baby Video',NULL,NULL,7,'2026-01-10 16:53:49',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(18,'https://www.instagram.com/reel/DTKHa8kkSYl/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==','Imported Instagram Video',NULL,NULL,NULL,'2026-01-10 17:01:58',0,NULL,1,'instagram');
INSERT INTO "videos" VALUES(19,'PP8wTx2NYNE','Kantha Nee Ther Eri l Vetrivel Muruganuku Arogaraa l Muruga l Tamil Murugan Song',NULL,NULL,8,'2026-01-10 17:50:33',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(20,'BYmMHeAvNLY','🔱 அடி மீது அடி வைத்து முருகன் அருள் பாடல் 🙏 Powerful Baby Murugan Song 🕉️ Devotional Divine Vibes 🎶',NULL,NULL,8,'2026-01-10 17:52:16',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(21,'Glt1LrMcFs8','Muthai tharu (Thiruppugazh) | Vande Guru Paramparaam | Sooryanarayanan',NULL,NULL,8,'2026-01-10 17:52:44',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(22,'Im9gGSlGUy0','Siva Sivayam Lyrical | Bakasuran | Selvaraghavan |Natty Natraj |Sam CS |Mohan G |GM Film Corporation',NULL,NULL,8,'2026-01-10 17:53:22',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(23,'362rrM1svpA','pachai mayil vaahanane |பச்சை மயில் வாகனனே| a.r.sailaksmi & a.r.saishreya |',NULL,NULL,8,'2026-01-10 17:54:45',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(24,'6hO9J9sAeJg','Baahubali Video Songs Tamil | Siva Sivaya Potri Video Song | Prabhas, Rana, Anushka, Tamannaah',NULL,NULL,8,'2026-01-10 19:49:58',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(25,'EEs4mY7YpTU','Mookuthi Amman | Paarthene Video Song | RJ Balaji | Nayanthara | Girishh Gopalakrishnan | Jairam',NULL,NULL,8,'2026-01-10 19:50:17',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(26,'lb6_fjkN_UY','Ennappan Allava | என் அப்பன் அல்லவா | Singer : M.sudhakar | Tamil Devotional Sivan song | Jothi Tv',NULL,NULL,8,'2026-01-10 19:53:33',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(27,'PTnjMpnnDC4','Powerful Hanuman Chalisa | HanuMan(Tamil) | Teja Sajja | Saicharan | Hanuman Jayanti Special Song',NULL,NULL,8,'2026-01-10 19:53:39',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(28,'rydNkOFDQwg','Kaakum Vadivel | Official Lyrical Video | Vaaheesan | Dharan Kumar | Kripakarjay J',NULL,NULL,8,'2026-01-10 19:56:12',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(29,'PNg-IXAFdqI','மனம் அமைதி பெற சித்தர் சிவவாக்கியர் பாடல் - ஓடி ஓடி ஓடி ஓடி உட்கலந்த ஜோதியை... பாடல்// Odi odi  song',NULL,NULL,8,'2026-01-10 20:01:00',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(30,'pUREzKCW6Wk','Types Of Waiters | Restaurants | Ft @NiharikaNm  | Jordindian',NULL,NULL,9,'2026-01-11 01:10:21',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(31,'CS0UAH2UhQw','Types Of Parents | Ft ThatMalluChick | Jordindian',NULL,NULL,9,'2026-01-11 01:13:36',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(32,'_G1pAARUeyQ','Types Of People At Pubs/Clubs | Jordindian',NULL,NULL,9,'2026-01-11 01:14:14',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(33,'S37kzUgu3bM','Types Of Sleepers | Jordindian',NULL,NULL,9,'2026-01-11 01:14:27',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(34,'Z-9iyiuNaq4','Politicians In India | When You Have A Politician Uncle | Jordindian Ft. Danish Sait',NULL,NULL,9,'2026-01-11 01:15:06',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(35,'rjB-jrqvt4E','How To Draw Zoey From KPop Demon Hunters',NULL,NULL,10,'2026-01-11 02:24:04',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(36,'4scf-93cXWc','How To Draw A Happy Winter Bunny',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(37,'WzoiC0jfJu4','How To Draw Happy Winter Mountains',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(38,'iuL_cP_Lico','How To Draw A Cute Winter Deer',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(39,'k6VIgOh_0lA','How To Draw Hot Wheels RD06',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(40,'1QjaQcHRezE','How To Draw Gary De''Snake Zootopia 2',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(41,'709e8D2Fk8M','Sketchbook challenge - design the outside of your new sketchbook! #artforkidshub',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(42,'k5nst7dgVPU','Happy New Year''s Eve 2026 From Art For Kids Hub!',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(43,'mHl8ualabAQ','The Simple Art Supplies We Use At Art For Kids Hub',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(44,'hncztWuSA2M','How To Draw 2026 Happy New Year!',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(45,'VNivzouazt4','Sketchbook challenge - 2026 Goal! 🎇 #artforkidshub',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(46,'grA-dfC-8SU','Sketchbook challenge - Christmas decorations! 🎄🎅🎁 #artforkidshub',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(47,'3mlFUzXXWKE','Celebrating 10 Million Art Friends!',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(48,'QZmoRdXf1mk','How To Draw Ralphie In Pink Bunny Pajamas',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(49,'05siTn0pOok','How To Draw Christmas Hello Kitty',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
INSERT INTO "videos" VALUES(50,'4v69Gj2nNl4','How To Draw A Gingerbread Family',NULL,NULL,NULL,'2026-01-11 05:47:25',0,NULL,1,'youtube');
CREATE TABLE playlists (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
, display_order INTEGER DEFAULT 0, channel_id INTEGER, is_global BOOLEAN DEFAULT 1, source_channel_id TEXT);
INSERT INTO "playlists" VALUES(1,'artforkidshub - UC5XMF3Inoi8R9nSI8ChOsdQ',1,1,1,'UC5XMF3Inoi8R9nSI8ChOsdQ');
INSERT INTO "playlists" VALUES(2,'Channel UC5XMF3Inoi8R9nSI8ChOsdQ',2,1,1,'UC5XMF3Inoi8R9nSI8ChOsdQ');
CREATE TABLE playlist_items (
  playlist_id INTEGER,
  video_id INTEGER,
  sort_order INTEGER,
  PRIMARY KEY (playlist_id, video_id),
  FOREIGN KEY (playlist_id) REFERENCES playlists(id),
  FOREIGN KEY (video_id) REFERENCES videos(id)
);
INSERT INTO "playlist_items" VALUES(1,36,0);
INSERT INTO "playlist_items" VALUES(1,37,1);
INSERT INTO "playlist_items" VALUES(1,38,2);
INSERT INTO "playlist_items" VALUES(1,39,3);
INSERT INTO "playlist_items" VALUES(1,40,4);
INSERT INTO "playlist_items" VALUES(1,41,5);
INSERT INTO "playlist_items" VALUES(1,42,6);
INSERT INTO "playlist_items" VALUES(1,43,7);
INSERT INTO "playlist_items" VALUES(1,44,8);
INSERT INTO "playlist_items" VALUES(1,45,9);
INSERT INTO "playlist_items" VALUES(1,46,10);
INSERT INTO "playlist_items" VALUES(1,47,11);
INSERT INTO "playlist_items" VALUES(1,48,12);
INSERT INTO "playlist_items" VALUES(1,49,13);
INSERT INTO "playlist_items" VALUES(1,50,14);
INSERT INTO "playlist_items" VALUES(2,36,0);
INSERT INTO "playlist_items" VALUES(2,37,1);
INSERT INTO "playlist_items" VALUES(2,38,2);
INSERT INTO "playlist_items" VALUES(2,39,3);
INSERT INTO "playlist_items" VALUES(2,40,4);
INSERT INTO "playlist_items" VALUES(2,41,5);
INSERT INTO "playlist_items" VALUES(2,42,6);
INSERT INTO "playlist_items" VALUES(2,43,7);
INSERT INTO "playlist_items" VALUES(2,44,8);
INSERT INTO "playlist_items" VALUES(2,45,9);
INSERT INTO "playlist_items" VALUES(2,46,10);
INSERT INTO "playlist_items" VALUES(2,47,11);
INSERT INTO "playlist_items" VALUES(2,48,12);
INSERT INTO "playlist_items" VALUES(2,49,13);
INSERT INTO "playlist_items" VALUES(2,50,14);
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  channel_name TEXT,
  magic_link_token TEXT,
  magic_link_expires TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
, password_hash TEXT);
INSERT INTO "users" VALUES(1,'admin@kfytube.com','Filtered','5feb97ef-0b16-41e8-8af8-a1c45ba230cb',NULL,'2026-01-10 00:50:14','password');
INSERT INTO "users" VALUES(2,'UC5XMF3Inoi8R9nSI8ChOsdQ@imported.kfytube','UC5XMF3Inoi8R9nSI8ChOsdQ',NULL,NULL,'2026-01-11 06:00:37',NULL);
CREATE TABLE d1_migrations(
		id         INTEGER PRIMARY KEY AUTOINCREMENT,
		name       TEXT UNIQUE,
		applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);
CREATE TABLE telegram_debug_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    sender TEXT,
    payload TEXT
);
INSERT INTO "telegram_debug_logs" VALUES(1,'2026-01-10 16:25:46','8329043131','{"update_id":47458214,"message":{"message_id":9,"from":{"id":8329043131,"is_bot":false,"first_name":"Koh","language_code":"en"},"chat":{"id":8329043131,"first_name":"Koh","type":"private"},"date":1768062346,"text":"/start","entities":[{"offset":0,"length":6,"type":"bot_command"}]}}');
INSERT INTO "telegram_debug_logs" VALUES(2,'2026-01-10 16:27:53','nelamurugan','{"update_id":47458215,"message":{"message_id":11,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768062473,"text":"https://www.youtube.com/watch?v=39ColarOWKo","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=39ColarOWKo"}}}');
INSERT INTO "telegram_debug_logs" VALUES(3,'2026-01-10 16:29:37','nelamurugan','{"update_id":47458216,"message":{"message_id":13,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768062577,"text":"https://www.youtube.com/watch?v=39ColarOWKo","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=39ColarOWKo"}}}');
INSERT INTO "telegram_debug_logs" VALUES(4,'2026-01-10 16:33:22','8329043131','{"update_id":47458217,"message":{"message_id":15,"from":{"id":8329043131,"is_bot":false,"first_name":"Koh","language_code":"en"},"chat":{"id":8329043131,"first_name":"Koh","type":"private"},"date":1768062801,"text":"https://youtu.be/-oG547iZkyg?si=H5bwEYIcrBi2GbrU","entities":[{"offset":0,"length":48,"type":"url"}],"link_preview_options":{"url":"https://youtu.be/-oG547iZkyg?si=H5bwEYIcrBi2GbrU"}}}');
INSERT INTO "telegram_debug_logs" VALUES(5,'2026-01-10 16:41:00','nelamurugan','{"update_id":47458218,"message":{"message_id":17,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768063260,"text":"https://www.youtube.com/watch?v=39ColarOWKo","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=39ColarOWKo"}}}');
INSERT INTO "telegram_debug_logs" VALUES(6,'2026-01-10 16:41:38','unknown','{"update_id":999999,"message":{"chat":{"id":1622090537},"text":"https://www.youtube.com/watch?v=39ColarOWKo"}}');
INSERT INTO "telegram_debug_logs" VALUES(7,'2026-01-10 16:44:17','nelamurugan','{"update_id":47458219,"message":{"message_id":20,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768063457,"text":"https://www.youtube.com/watch?v=39ColarOWKo","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=39ColarOWKo"}}}');
INSERT INTO "telegram_debug_logs" VALUES(8,'2026-01-10 16:44:24','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=39ColarOWKo -> ID: 39ColarOWKo","DB Error: Error: D1_ERROR: table videos has no column named source_type: SQLITE_ERROR"]}');
INSERT INTO "telegram_debug_logs" VALUES(9,'2026-01-10 16:50:06','nelamurugan','{"update_id":47458220,"message":{"message_id":22,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768063806,"text":"https://www.youtube.com/watch?v=39ColarOWKo","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=39ColarOWKo"}}}');
INSERT INTO "telegram_debug_logs" VALUES(10,'2026-01-10 16:50:06','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=39ColarOWKo -> ID: 39ColarOWKo"]}');
INSERT INTO "telegram_debug_logs" VALUES(11,'2026-01-10 16:52:41','8329043131','{"update_id":47458221,"message":{"message_id":24,"from":{"id":8329043131,"is_bot":false,"first_name":"Koh","language_code":"en"},"chat":{"id":8329043131,"first_name":"Koh","type":"private"},"date":1768063961,"text":"https://youtu.be/-oG547iZkyg?si=H5bwEYIcrBi2GbrU FUNNY","entities":[{"offset":0,"length":48,"type":"url"}],"link_preview_options":{"url":"https://youtu.be/-oG547iZkyg?si=H5bwEYIcrBi2GbrU"}}}');
INSERT INTO "telegram_debug_logs" VALUES(12,'2026-01-10 16:52:42','system','{"event":"processing_result","logs":["URL: https://youtu.be/-oG547iZkyg?si=H5bwEYIcrBi2GbrU -> ID: -oG547iZkyg"],"intent":"FUNNY"}');
INSERT INTO "telegram_debug_logs" VALUES(13,'2026-01-10 16:53:49','8329043131','{"update_id":47458222,"message":{"message_id":26,"from":{"id":8329043131,"is_bot":false,"first_name":"Koh","language_code":"en"},"chat":{"id":8329043131,"first_name":"Koh","type":"private"},"date":1768064029,"text":"https://youtu.be/8PHbr2m7auo?si=NRsn_f8lS3v5WaTn","entities":[{"offset":0,"length":48,"type":"url"}],"link_preview_options":{"url":"https://youtu.be/8PHbr2m7auo?si=NRsn_f8lS3v5WaTn"}}}');
INSERT INTO "telegram_debug_logs" VALUES(14,'2026-01-10 16:53:49','system','{"event":"processing_result","logs":["URL: https://youtu.be/8PHbr2m7auo?si=NRsn_f8lS3v5WaTn -> ID: 8PHbr2m7auo"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(15,'2026-01-10 16:59:02','nelamurugan','{"update_id":47458223,"message":{"message_id":28,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768064342,"text":"https://www.instagram.com/reel/DTKHa8kkSYl/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==","entities":[{"offset":0,"length":93,"type":"url"}],"link_preview_options":{"url":"https://www.instagram.com/reel/DTKHa8kkSYl/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ=="}}}');
INSERT INTO "telegram_debug_logs" VALUES(16,'2026-01-10 16:59:03','system','{"event":"processing_result","logs":["URL: https://www.instagram.com/reel/DTKHa8kkSYl/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ== -> ID: null"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(17,'2026-01-10 17:01:57','nelamurugan','{"update_id":47458224,"message":{"message_id":30,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768064517,"text":"https://www.instagram.com/reel/DTKHa8kkSYl/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==","entities":[{"offset":0,"length":93,"type":"url"}],"link_preview_options":{"url":"https://www.instagram.com/reel/DTKHa8kkSYl/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ=="}}}');
INSERT INTO "telegram_debug_logs" VALUES(18,'2026-01-10 17:01:58','system','{"event":"processing_result","logs":["URL: https://www.instagram.com/reel/DTKHa8kkSYl/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ== -> Data: {\"id\":\"https://www.instagram.com/reel/DTKHa8kkSYl/?utm_source=ig_web_copy_link&igsh=NTc4MTIwNjQ2YQ==\",\"source\":\"instagram\"}"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(19,'2026-01-10 17:50:32','nelamurugan','{"update_id":47458225,"message":{"message_id":32,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768067432,"text":"https://youtu.be/PP8wTx2NYNE?si=Aa8p_CenCRnwRosy","entities":[{"offset":0,"length":48,"type":"url"}],"link_preview_options":{"url":"https://youtu.be/PP8wTx2NYNE?si=Aa8p_CenCRnwRosy"}}}');
INSERT INTO "telegram_debug_logs" VALUES(20,'2026-01-10 17:50:33','system','{"event":"processing_result","logs":["URL: https://youtu.be/PP8wTx2NYNE?si=Aa8p_CenCRnwRosy -> Data: {\"id\":\"PP8wTx2NYNE\",\"source\":\"youtube\"}"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(21,'2026-01-10 17:52:16','nelamurugan','{"update_id":47458226,"message":{"message_id":34,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768067535,"text":"https://youtu.be/BYmMHeAvNLY?si=-_DzTUsyh8Gc-AUC God","entities":[{"offset":0,"length":48,"type":"url"}],"link_preview_options":{"url":"https://youtu.be/BYmMHeAvNLY?si=-_DzTUsyh8Gc-AUC"}}}');
INSERT INTO "telegram_debug_logs" VALUES(22,'2026-01-10 17:52:16','system','{"event":"processing_result","logs":["URL: https://youtu.be/BYmMHeAvNLY?si=-_DzTUsyh8Gc-AUC -> Data: {\"id\":\"BYmMHeAvNLY\",\"source\":\"youtube\"}"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(23,'2026-01-10 17:52:43','nelamurugan','{"update_id":47458227,"message":{"message_id":36,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768067563,"text":"https://youtu.be/Glt1LrMcFs8?si=cHcYaHdkfQNaSvJ6","entities":[{"offset":0,"length":48,"type":"url"}],"link_preview_options":{"url":"https://youtu.be/Glt1LrMcFs8?si=cHcYaHdkfQNaSvJ6"}}}');
INSERT INTO "telegram_debug_logs" VALUES(24,'2026-01-10 17:52:44','system','{"event":"processing_result","logs":["URL: https://youtu.be/Glt1LrMcFs8?si=cHcYaHdkfQNaSvJ6 -> Data: {\"id\":\"Glt1LrMcFs8\",\"source\":\"youtube\"}"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(25,'2026-01-10 17:53:22','nelamurugan','{"update_id":47458228,"message":{"message_id":38,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768067602,"text":"https://youtu.be/Im9gGSlGUy0?si=J9UiVLGSren7pYRe. God","entities":[{"offset":0,"length":48,"type":"url"}],"link_preview_options":{"url":"https://youtu.be/Im9gGSlGUy0?si=J9UiVLGSren7pYRe"}}}');
INSERT INTO "telegram_debug_logs" VALUES(26,'2026-01-10 17:53:22','system','{"event":"processing_result","logs":["URL: https://youtu.be/Im9gGSlGUy0?si=J9UiVLGSren7pYRe. -> Data: {\"id\":\"Im9gGSlGUy0\",\"source\":\"youtube\"}"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(27,'2026-01-10 17:54:45','nelamurugan','{"update_id":47458229,"message":{"message_id":40,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768067684,"text":"https://youtu.be/362rrM1svpA?si=Xe9B6WZMKv91pNi-","entities":[{"offset":0,"length":48,"type":"url"}],"link_preview_options":{"url":"https://youtu.be/362rrM1svpA?si=Xe9B6WZMKv91pNi-"}}}');
INSERT INTO "telegram_debug_logs" VALUES(28,'2026-01-10 17:54:45','system','{"event":"processing_result","logs":["URL: https://youtu.be/362rrM1svpA?si=Xe9B6WZMKv91pNi- -> Data: {\"id\":\"362rrM1svpA\",\"source\":\"youtube\"}"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(29,'2026-01-10 19:49:57','nelamurugan','{"update_id":47458230,"message":{"message_id":42,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768074597,"text":"https://www.youtube.com/watch?v=6hO9J9sAeJg God","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=6hO9J9sAeJg"}}}');
INSERT INTO "telegram_debug_logs" VALUES(30,'2026-01-10 19:49:58','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=6hO9J9sAeJg -> Data: {\"id\":\"6hO9J9sAeJg\",\"source\":\"youtube\"}"],"intent":"God"}');
INSERT INTO "telegram_debug_logs" VALUES(31,'2026-01-10 19:50:17','nelamurugan','{"update_id":47458231,"message":{"message_id":44,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768074617,"text":"https://www.youtube.com/watch?v=EEs4mY7YpTU god","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=EEs4mY7YpTU"}}}');
INSERT INTO "telegram_debug_logs" VALUES(32,'2026-01-10 19:50:17','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=EEs4mY7YpTU -> Data: {\"id\":\"EEs4mY7YpTU\",\"source\":\"youtube\"}"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(33,'2026-01-10 19:53:33','nelamurugan','{"update_id":47458232,"message":{"message_id":46,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768074812,"text":"https://www.youtube.com/watch?v=lb6_fjkN_UY god","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=lb6_fjkN_UY"}}}');
INSERT INTO "telegram_debug_logs" VALUES(34,'2026-01-10 19:53:33','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=lb6_fjkN_UY -> Data: {\"id\":\"lb6_fjkN_UY\",\"source\":\"youtube\"}"],"intent":"god"}');
INSERT INTO "telegram_debug_logs" VALUES(35,'2026-01-10 19:53:39','nelamurugan','{"update_id":47458233,"message":{"message_id":48,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768074819,"text":"https://www.youtube.com/watch?v=PTnjMpnnDC4 go","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=PTnjMpnnDC4"}}}');
INSERT INTO "telegram_debug_logs" VALUES(36,'2026-01-10 19:53:39','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=PTnjMpnnDC4 -> Data: {\"id\":\"PTnjMpnnDC4\",\"source\":\"youtube\"}"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(37,'2026-01-10 19:56:12','nelamurugan','{"update_id":47458234,"message":{"message_id":50,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768074972,"text":"https://www.youtube.com/watch?v=rydNkOFDQwg god","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=rydNkOFDQwg"}}}');
INSERT INTO "telegram_debug_logs" VALUES(38,'2026-01-10 19:56:12','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=rydNkOFDQwg -> Data: {\"id\":\"rydNkOFDQwg\",\"source\":\"youtube\"}"],"intent":"god"}');
INSERT INTO "telegram_debug_logs" VALUES(39,'2026-01-10 20:01:00','nelamurugan','{"update_id":47458235,"message":{"message_id":52,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768075259,"text":"https://www.youtube.com/watch?v=PNg-IXAFdqI god","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=PNg-IXAFdqI"}}}');
INSERT INTO "telegram_debug_logs" VALUES(40,'2026-01-10 20:01:00','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=PNg-IXAFdqI -> Data: {\"id\":\"PNg-IXAFdqI\",\"source\":\"youtube\"}"],"intent":"god"}');
INSERT INTO "telegram_debug_logs" VALUES(41,'2026-01-11 01:10:21','nelamurugan','{"update_id":47458236,"message":{"message_id":54,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768093821,"text":"https://www.youtube.com/watch?v=pUREzKCW6Wk JUSTLIKETHAT","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=pUREzKCW6Wk"}}}');
INSERT INTO "telegram_debug_logs" VALUES(42,'2026-01-11 01:10:21','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=pUREzKCW6Wk -> Data: {\"id\":\"pUREzKCW6Wk\",\"source\":\"youtube\"}"],"intent":"JUSTLIKETHAT"}');
INSERT INTO "telegram_debug_logs" VALUES(43,'2026-01-11 01:13:36','nelamurugan','{"update_id":47458237,"message":{"message_id":56,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768094015,"text":"https://youtu.be/CS0UAH2UhQw?si=DrpG4PKKx4yvpt3G Justlikethat","entities":[{"offset":0,"length":48,"type":"url"}],"link_preview_options":{"url":"https://youtu.be/CS0UAH2UhQw?si=DrpG4PKKx4yvpt3G"}}}');
INSERT INTO "telegram_debug_logs" VALUES(44,'2026-01-11 01:13:36','system','{"event":"processing_result","logs":["URL: https://youtu.be/CS0UAH2UhQw?si=DrpG4PKKx4yvpt3G -> Data: {\"id\":\"CS0UAH2UhQw\",\"source\":\"youtube\"}"],"intent":"Justlikethat"}');
INSERT INTO "telegram_debug_logs" VALUES(45,'2026-01-11 01:14:14','nelamurugan','{"update_id":47458238,"message":{"message_id":58,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768094053,"text":"https://www.youtube.com/watch?v=_G1pAARUeyQ Justlikethat","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=_G1pAARUeyQ"}}}');
INSERT INTO "telegram_debug_logs" VALUES(46,'2026-01-11 01:14:14','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=_G1pAARUeyQ -> Data: {\"id\":\"_G1pAARUeyQ\",\"source\":\"youtube\"}"],"intent":"Justlikethat"}');
INSERT INTO "telegram_debug_logs" VALUES(47,'2026-01-11 01:14:27','nelamurugan','{"update_id":47458239,"message":{"message_id":60,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768094067,"text":"https://www.youtube.com/watch?v=S37kzUgu3bM Justlikethat","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=S37kzUgu3bM"}}}');
INSERT INTO "telegram_debug_logs" VALUES(48,'2026-01-11 01:14:28','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=S37kzUgu3bM -> Data: {\"id\":\"S37kzUgu3bM\",\"source\":\"youtube\"}"],"intent":"Justlikethat"}');
INSERT INTO "telegram_debug_logs" VALUES(49,'2026-01-11 01:15:06','nelamurugan','{"update_id":47458240,"message":{"message_id":62,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768094106,"text":"https://www.youtube.com/watch?v=Z-9iyiuNaq4","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=Z-9iyiuNaq4"}}}');
INSERT INTO "telegram_debug_logs" VALUES(50,'2026-01-11 01:15:06','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=Z-9iyiuNaq4 -> Data: {\"id\":\"Z-9iyiuNaq4\",\"source\":\"youtube\"}"],"intent":"none"}');
INSERT INTO "telegram_debug_logs" VALUES(51,'2026-01-11 02:24:04','nelamurugan','{"update_id":47458241,"message":{"message_id":64,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768098244,"text":"https://www.youtube.com/watch?v=rjB-jrqvt4E DRAWING","entities":[{"offset":0,"length":43,"type":"url"}],"link_preview_options":{"url":"https://www.youtube.com/watch?v=rjB-jrqvt4E"}}}');
INSERT INTO "telegram_debug_logs" VALUES(52,'2026-01-11 02:24:04','system','{"event":"processing_result","logs":["URL: https://www.youtube.com/watch?v=rjB-jrqvt4E -> Data: {\"id\":\"rjB-jrqvt4E\",\"source\":\"youtube\"}"],"intent":"DRAWING"}');
INSERT INTO "telegram_debug_logs" VALUES(53,'2026-01-11 02:31:09','nelamurugan','{"update_id":47458242,"message":{"message_id":66,"from":{"id":1622090537,"is_bot":false,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","language_code":"en"},"chat":{"id":1622090537,"first_name":"Elamurugan","last_name":"Nallathambi","username":"nelamurugan","type":"private"},"date":1768098669,"message_auto_delete_timer_changed":{"message_auto_delete_time":86400}}}');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" VALUES('categories',10);
INSERT INTO "sqlite_sequence" VALUES('admins_backup_pre_migration',1);
INSERT INTO "sqlite_sequence" VALUES('videos',65);
INSERT INTO "sqlite_sequence" VALUES('users',2);
INSERT INTO "sqlite_sequence" VALUES('telegram_debug_logs',53);
INSERT INTO "sqlite_sequence" VALUES('playlists',2);
