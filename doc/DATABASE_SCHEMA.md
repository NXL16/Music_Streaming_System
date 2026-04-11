# 🗄️ Thiết Kế Cơ Sở Dữ Liệu - Hệ Thống Phát Nhạc

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07

---

## 📑 Mục Lục

1. [Tổng Quan](#tổng-quan)
2. [MongoDB Schema](#mongodb-schema)
3. [MySQL Schema](#mysql-schema)
4. [Chỉ Mục & Tối Ưu Hóa](#chỉ-mục--tối-ưu-hóa)
5. [Quan Hệ Giữa Collection](#quan-hệ-giữa-collection)
6. [Migrations](#migrations)
7. [Backup & Recovery](#backup--recovery)

---

## 🎯 Tổng Quan

Hệ thống sử dụng:

- **MongoDB Atlas:** Lưu trữ metadata (Bài hát, Người dùng, Playlist, Lịch sử)
- **MySQL:** Lưu trữ khóa mã hóa và audit logs (KMS Service)
- **Redis:** Cache tạm thời (không persistent)

---

## 📊 MongoDB Schema

### Collection 1: Người Dùng (users)

**Mục Đích:** Lưu trữ thông tin người dùng

**Schema:**

```javascript
{
  _id: ObjectId,

  // Thông tin đăng nhập
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
    trim: true,
    minlength: 3,
    maxlength: 50
  },

  password: {
    type: String,
    required: true,
    minlength: 60  // Bcrypt hash
  },

  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    index: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  },

  // Hồ Sơ
  displayName: {
    type: String,
    required: true,
    maxlength: 100
  },

  avatar: {
    type: String,
    default: null,
    index: false
  },

  bio: {
    type: String,
    maxlength: 500,
    default: ""
  },

  // Vai Trò & Quyền
  role: {
    type: String,
    enum: ["user", "admin"],
    default: "user",
    index: true
  },

  permissions: [String],  // Quyền nâng cao

  // Trạng Thái
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },

  emailVerified: {
    type: Boolean,
    default: false
  },

  twoFactorEnabled: {
    type: Boolean,
    default: false
  },

  // Device Fingerprints
  deviceFingerprints: [{
    fingerprint: String,
    lastUsedAt: Date,
    lastIp: String,
    userAgent: String
  }],

  // Thống Kê
  stats: {
    totalPlays: {
      type: Number,
      default: 0
    },
    totalPlaytime: {
      type: Number,
      default: 0
    },
    totalPlaylistsCreated: {
      type: Number,
      default: 0
    },
    totalFollowers: {
      type: Number,
      default: 0
    }
  },

  // Ngày & Thời Gian
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  lastLoginAt: {
    type: Date,
    default: null,
    index: true
  },

  lastPasswordChangeAt: {
    type: Date,
    default: Date.now
  },

  updatedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}
```

**Ví Dụ Document:**

```javascript
{
  _id: ObjectId("507f1f77bcf86cd799439011"),
  username: "john_doe",
  password: "$2b$12$...", // Bcrypt hash
  email: "john@example.com",
  displayName: "John Doe",
  avatar: "https://r2.yourdomain.com/avatars/user123.webp",
  bio: "Music lover",
  role: "user",
  isActive: true,
  emailVerified: true,
  stats: {
    totalPlays: 1234,
    totalPlaytime: 3600000,
    totalPlaylistsCreated: 5,
    totalFollowers: 10
  },
  createdAt: ISODate("2026-04-07T10:00:00Z"),
  lastLoginAt: ISODate("2026-04-07T10:30:00Z"),
  updatedAt: ISODate("2026-04-07T10:30:00Z")
}
```

---

### Collection 2: Bài Hát (songs)

**Mục Đích:** Lưu trữ metadata và trạng thái phát hành HLS

**Schema:**

```javascript
{
  _id: ObjectId,

  // Thông Tin Cơ Bản
  title: {
    type: String,
    required: true,
    trim: true,
    maxlength: 255,
    text: true  // Text index
  },

  artistId: {
    type: ObjectId,
    required: true,
    ref: "Artist",
    index: true
  },

  album: {
    type: String,
    maxlength: 255,
    default: ""
  },

  duration: {
    type: Number,  // Giây
    required: true,
    min: 1,
    max: 7200  // Tối đa 2 giờ
  },

  genre: {
    type: String,
    maxlength: 50,
    default: ""
  },

  releaseDate: {
    type: Date,
    default: null
  },

  description: {
    type: String,
    maxlength: 1000,
    default: ""
  },

  lyrics: {
    type: String,
    default: ""
  },

  // HLS & Streaming
  hlsMasterPath: {
    type: String,
    default: null,
    index: true,
    unique: true,
    sparse: true
  },

  hlsKeyId: {
    type: String,  // Reference to KMS key
    default: null
  },

  hlsIV: {
    type: String,  // Hex-encoded IV
    default: null
  },

  isEncrypted: {
    type: Boolean,
    default: false
  },

  // Bitrates (Các Biến Thể Chất Lượng)
  bitrates: [{
    quality: {
      type: String,
      enum: ["128k", "192k", "320k"]
    },
    path: String,  // 128k/playlist.m3u8
    bandwidth: Number,
    avgSegmentSize: Number,
    segmentCount: Number
  }],

  // Trực Quan
  blurHash: {
    type: String,  // BlurHash encoded
    default: null
  },

  waveform: [Number],  // 150 data points

  thumbnails: {
    small: {
      type: String,
      default: null
    },
    medium: {
      type: String,
      default: null
    },
    large: {
      type: String,
      default: null
    }
  },

  // File Integrity
  checksum: {
    type: String,  // SHA-256
    required: true,
    unique: true,
    index: true
  },

  fileSize: {
    type: Number,  // Bytes
    default: 0
  },

  originalFormat: {
    type: String,  // mp3, flac, wav
    default: null
  },

  // Trạng Thái Xử Lý
  status: {
    type: String,
    enum: ["processing", "ready", "failed"],
    default: "processing",
    index: true
  },

  processingLog: {
    type: String,  // Error message if failed
    default: null
  },

  processingStartedAt: {
    type: Date,
    default: null
  },

  processingCompletedAt: {
    type: Date,
    default: null
  },

  // Metrics
  metrics: {
    playCount: {
      type: Number,
      default: 0
    },
    likeCount: {
      type: Number,
      default: 0
    },
    shareCount: {
      type: Number,
      default: 0
    },
    skipCount: {
      type: Number,
      default: 0
    }
  },

  // Quản Lý
  isPublic: {
    type: Boolean,
    default: true,
    index: true
  },

  uploadedBy: {
    type: ObjectId,
    ref: "User",
    index: true
  },

  // Ngày & Thời Gian
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}
```

---

### Collection 3: Nghệ Sĩ (artists)

**Schema:**

```javascript
{
  _id: ObjectId,

  name: {
    type: String,
    required: true,
    unique: true,
    text: true,
    index: true
  },

  avatar: String,  // URL

  bio: String,

  socials: {
    facebook: String,
    instagram: String,
    twitter: String,
    spotify: String
  },

  stats: {
    totalSongs: {
      type: Number,
      default: 0
    },
    totalPlays: {
      type: Number,
      default: 0
    },
    totalFollowers: {
      type: Number,
      default: 0
    }
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}
```

---

### Collection 4: Playlist

**Schema:**

```javascript
{
  _id: ObjectId,

  userId: {
    type: ObjectId,
    required: true,
    ref: "User",
    index: true
  },

  name: {
    type: String,
    required: true,
    maxlength: 255,
    text: true
  },

  description: {
    type: String,
    maxlength: 1000,
    default: ""
  },

  songIds: [{
    type: ObjectId,
    ref: "Song"
  }],

  thumbnail: String,  // URL

  isPublic: {
    type: Boolean,
    default: false,
    index: true
  },

  metrics: {
    totalDuration: {
      type: Number,
      default: 0
    },
    songCount: {
      type: Number,
      default: 0
    },
    followerCount: {
      type: Number,
      default: 0
    }
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },

  updatedAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}
```

---

### Collection 5: Lịch Sử Nghe (playHistory)

**Mục Đích:** Ghi lại lịch sử nghe của người dùng (TTL: 365 ngày)

**Schema:**

```javascript
{
  _id: ObjectId,

  userId: {
    type: ObjectId,
    required: true,
    ref: "User",
    index: true
  },

  songId: {
    type: ObjectId,
    required: true,
    ref: "Song",
    index: true
  },

  // Thông Tin Phát Nhạc
  playedAt: {
    type: Date,
    default: Date.now,
    index: true,
    expireAfterSeconds: 31536000  // TTL: 365 ngày
  },

  duration: Number,  // Giây

  completionRate: {
    type: Number,  // 0-100 (%)
    default: 0
  },

  bytesDownloaded: Number,

  averageBitrate: Number,

  // Thông Tin Client
  deviceFingerprint: {
    type: String,
    index: true
  },

  ipAddress: String,

  userAgent: String,

  platform: {
    type: String,
    enum: ["web", "ios", "android"]
  },

  selectedBitrate: String,  // "128k", "192k", "320k"

  // Chất Lượng
  bufferingEvents: {
    type: Number,
    default: 0
  },

  averageBufferDuration: Number,

  networkQuality: {
    type: String,
    enum: ["poor", "fair", "good", "excellent"]
  }
}
```

---

### Collection 6: Streaming Keys (KMS Reference)

**Mục Đích:** Lưu metadata khóa (khóa thực lưu ở MySQL)

**Schema:**

```javascript
{
  _id: ObjectId,

  songId: {
    type: ObjectId,
    required: true,
    ref: "Song",
    unique: true,
    sparse: true,
    index: true
  },

  keyVersion: {
    type: Number,
    default: 1
  },

  kmsKeyId: String,  // ID khóa trong KMS database

  keyStatus: {
    type: String,
    enum: ["active", "retired", "expired"],
    default: "active"
  },

  createdAt: {
    type: Date,
    default: Date.now
  },

  expiresAt: {
    type: Date,
    default: null
  },

  rotatedAt: {
    type: Date,
    default: null
  }
}
```

---

## 💾 MySQL Schema

### Table 1: Khóa (keys)

**Mục Đích:** Lưu trữ khóa mã hóa (mã hóa cấp 2)

```sql
CREATE TABLE `keys` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,

  `song_id` VARCHAR(36) NOT NULL,
  `key_binary` BLOB NOT NULL,                 -- 16 bytes AES key (encrypted at rest)
  `iv` VARCHAR(32) NOT NULL,                  -- Hex-encoded IV
  `version` INT DEFAULT 1,

  `is_active` BOOLEAN DEFAULT true,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `expires_at` TIMESTAMP NULL,
  `rotated_at` TIMESTAMP NULL,

  CONSTRAINT `uk_song_version` UNIQUE(`song_id`, `version`),
  INDEX `idx_song_id` (`song_id`),
  INDEX `idx_version` (`version`),
  INDEX `idx_created_at` (`created_at`),
  INDEX `idx_is_active` (`is_active`),
  INDEX `idx_expires_at` (`expires_at`)
);
```

---

### Table 2: Audit Logs

**Mục Đích:** Ghi lại tất cả truy cập khóa (compliance)

```sql
CREATE TABLE `audit_logs` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,

  `action` VARCHAR(50) NOT NULL,
  `user_id` VARCHAR(36),
  `song_id` VARCHAR(36),
  `device_fingerprint` VARCHAR(255),
  `ip_address` VARCHAR(45),
  `user_agent` TEXT,

  `success` BOOLEAN DEFAULT true,
  `error_message` TEXT,

  `details` JSON,

  `timestamp` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX `idx_action` (`action`),
  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_song_id` (`song_id`),
  INDEX `idx_timestamp` (`timestamp`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

### Table 3: Hỗ Trợ Lịch Sử (Support History)

**Mục Đích:** Lưu trữ lịch sử tương tác hỗ trợ

```sql
CREATE TABLE `support_history` (
  `id` INT PRIMARY KEY AUTO_INCREMENT,

  `user_id` VARCHAR(36) NOT NULL,
  `issue_type` VARCHAR(50),
  `description` TEXT,

  `status` ENUM('open', 'in_progress', 'resolved', 'closed') DEFAULT 'open',

  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `resolved_at` TIMESTAMP NULL,

  INDEX `idx_user_id` (`user_id`),
  INDEX `idx_status` (`status`),
  INDEX `idx_created_at` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 📑 Chỉ Mục & Tối Ưu Hóa

### MongoDB Indexes

```javascript
// ========== USERS COLLECTION ==========
// Xác thực
db.users.createIndex({ username: 1 }, { unique: true });
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ role: 1 });

// Tìm kiếm & Filter
db.users.createIndex({ isActive: 1, createdAt: -1 });
db.users.createIndex({ lastLoginAt: -1 });

// ========== SONGS COLLECTION ==========
// Text Search
db.songs.createIndex({ title: "text", artistId: 1 });

// Chống trùng
db.songs.createIndex({ checksum: 1 }, { unique: true });

// Trạng thái & Lọc
db.songs.createIndex({ status: 1, isPublic: 1 });
db.songs.createIndex({ status: 1, updatedAt: -1 });

// HLS Streaming
db.songs.createIndex({ hlsMasterPath: 1 }, { unique: true, sparse: true });

// Thống kê
db.songs.createIndex({ "metrics.playCount": -1 });

// ========== PLAYLISTS COLLECTION ==========
db.playlists.createIndex({ userId: 1 });
db.playlists.createIndex({ isPublic: 1, createdAt: -1 });

// ========== PLAYHISTORY COLLECTION ==========
// TTL Index (tự động xóa sau 365 ngày)
db.play_history.createIndex({ playedAt: 1 }, { expireAfterSeconds: 31536000 });

// Tìm kiếm lịch sử
db.play_history.createIndex({ userId: 1, playedAt: -1 });
db.play_history.createIndex({ songId: 1, playedAt: -1 });

// ========== ARTISTS COLLECTION ==========
db.artists.createIndex({ name: "text" });
db.artists.createIndex({ name: 1 }, { unique: true });

// ========== STREAMING KEYS COLLECTION ==========
db.streaming_keys.createIndex({ songId: 1 });
db.streaming_keys.createIndex({ keyVersion: -1 });
```

### MySQL Indexes

```sql
-- ========== KEYS TABLE ==========
ALTER TABLE `keys` ADD CONSTRAINT uk_song_version UNIQUE(song_id, version);
ALTER TABLE `keys` ADD INDEX idx_song_id (song_id);
ALTER TABLE `keys` ADD INDEX idx_version (version);
ALTER TABLE `keys` ADD INDEX idx_is_active (is_active);
ALTER TABLE `keys` ADD INDEX idx_expires_at (expires_at);

-- ========== AUDIT_LOGS TABLE ==========
ALTER TABLE `audit_logs` ADD INDEX idx_action (action);
ALTER TABLE `audit_logs` ADD INDEX idx_user_id (user_id);
ALTER TABLE `audit_logs` ADD INDEX idx_song_id (song_id);
ALTER TABLE `audit_logs` ADD INDEX idx_timestamp (timestamp);

-- ========== SUPPORT_HISTORY TABLE ==========
ALTER TABLE `support_history` ADD INDEX idx_user_id (user_id);
ALTER TABLE `support_history` ADD INDEX idx_status (status);
ALTER TABLE `support_history` ADD INDEX idx_created_at (created_at);
```

---

## 🔗 Quan Hệ Giữa Collection

### Diagram Quan Hệ

```
┌─────────────┐         ┌──────────────┐         ┌───────────────┐
│   Users     │         │   Artists    │         │     Songs     │
│  (ObjectId) │         │ (ObjectId)   │         │  (ObjectId)   │
└──────┬──────┘         └──────┬───────┘         └───────┬────────┘
       │                       │                        │
       │                       │                        │
       │                       └─────────┬──────────────┤
       │                                  │              │
       │                    ┌─────────────▼──────────────▼─────┐
       │                    │    Playlist                      │
       │                    │    - userId (ref Users)          │
       │                    │    - songIds (ref Songs array)   │
       │                    │    - artistIds (implicit)        │
       │                    └────────���──────────────────────────┘
       │
       ├──────────────────────────┐
       │                          │
       ▼                          ▼
┌──────────────────┐    ┌──────────────────┐
│  PlayHistory     │    │ StreamingKeys    │
│  - userId (ref)  │    │ - songId (ref)   │
│  - songId (ref)  │    │ - kmsKeyId       │
└──────────────────┘    └──────────────────┘
```

---

## 🔄 Migrations

### Migration 1: Khởi Tạo Schema Ban Đầu (001)

```javascript
// migration-001-create-initial-schema.ts
export async function migrate() {
  // MongoDB Collections
  await createUsersCollection();
  await createSongsCollection();
  await createArtistsCollection();
  await createPlaylistsCollection();
  await createPlayHistoryCollection();
  await createStreamingKeysCollection();

  // MySQL Tables
  await createKeysTable();
  await createAuditLogsTable();
  await createSupportHistoryTable();

  console.log("✅ Migration 001 hoàn thành");
}

export async function rollback() {
  // Drop collections/tables
  await db.collection("users").drop();
  await db.collection("songs").drop();
  // ... etc
}
```

---

### Migration 2: Thêm Chỉ Mục Tối Ưu (002)

```javascript
// migration-002-add-indexes.ts
export async function migrate() {
  // MongoDB
  db.users.createIndex({ username: 1 }, { unique: true });
  db.songs.createIndex({ title: "text", artistId: 1 });
  db.play_history.createIndex(
    { playedAt: 1 },
    { expireAfterSeconds: 31536000 },
  );

  // MySQL
  await mysql.query(`
    ALTER TABLE keys ADD CONSTRAINT uk_song_version UNIQUE(song_id, version);
  `);

  console.log("✅ Migration 002 hoàn thành");
}

export async function rollback() {
  // Drop indexes
  db.users.dropIndex("username_1");
  // ... etc
}
```

---

## 💾 Backup & Recovery

### Backup MongoDB

```bash
# Backup toàn bộ database
mongodump --uri "mongodb+srv://admin:password@cluster0.mongodb.net/music_streaming" \
  --archive=backup_$(date +%Y%m%d).archive

# Restore
mongorestore --uri "mongodb+srv://admin:password@cluster0.mongodb.net/music_streaming" \
  --archive=backup_20260407.archive
```

### Backup MySQL

```bash
# Backup
mysqldump -h localhost -u user -p music_streaming > backup_$(date +%Y%m%d).sql

# Restore
mysql -h localhost -u user -p music_streaming < backup_20260407.sql
```

### Backup Strategy

| Hệ Thống    | Tần Suất   | Retention | RTO     |
| :---------- | :--------- | :-------- | :------ |
| **MongoDB** | Mỗi 6 giờ  | 30 ngày   | 1 giờ   |
| **MySQL**   | Mỗi 24 giờ | 90 ngày   | 30 phút |
| **R2**      | Versioning | 30 ngày   | 2 giờ   |

---

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-08
