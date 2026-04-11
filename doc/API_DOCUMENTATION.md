# 📡 Tài Liệu API - Hệ Thống Phát Nhạc Trực Tuyến

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07  
**Base URL:** `https://api.yourdomain.com/api/v1`  
**Authentication:** JWT Bearer Token

---

## 📑 Mục Lục

1. [Giới Thiệu](#giới-thiệu)
2. [Xác Thực](#xác-thực)
3. [Endpoint Người Dùng](#endpoint-người-dùng)
4. [Endpoint Bài Hát](#endpoint-bài-hát)
5. [Endpoint Streaming](#endpoint-streaming)
6. [Endpoint Playlist](#endpoint-playlist)
7. [Endpoint Admin](#endpoint-admin)
8. [Error Handling](#error-handling)
9. [Rate Limiting](#rate-limiting)
10. [Status Codes](#status-codes)

---

## 🔍 Giới Thiệu

### Tiêu Chuẩn API

- **Format:** REST API + JSON
- **Versioning:** `/api/v1`
- **Authentication:** JWT Bearer Token (24 giờ)
- **Content-Type:** `application/json`
- **Charset:** UTF-8

### Headers Bắt Buộc

```http
Content-Type: application/json
Authorization: Bearer {JWT_TOKEN}
Device-FP: {device_fingerprint_hash}
X-Request-ID: {correlation_id}
```

### Response Format

```json
{
  "success": true,
  "code": "SUCCESS_001",
  "data": {},
  "message": "Thành công",
  "timestamp": "2026-04-07T10:00:00Z",
  "requestId": "uuid-12345"
}
```

---

## 🔐 Xác Thực

### 1. Đăng Ký Người Dùng

**Endpoint:**

```http
POST /auth/signup
Content-Type: application/json
```

**Request Body:**

```json
{
  "username": "john_doe",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "displayName": "John Doe"
}
```

**Validation Rules:**

- `username`: 3-50 ký tự, chỉ chứa a-z, 0-9, \_ (không bắt đầu bằng số)
- `email`: Email hợp lệ (RFC 5322)
- `password`: Tối thiểu 8 ký tự, phải chứa: hoa, thường, số, ký tự đặc biệt
- `displayName`: 1-100 ký tự

**Response (201 Created):**

```json
{
  "success": true,
  "code": "AUTH_SIGNUP_SUCCESS",
  "data": {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "expiresIn": 86400,
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "username": "john_doe",
      "email": "john@example.com",
      "displayName": "John Doe",
      "role": "user",
      "createdAt": "2026-04-07T10:00:00Z"
    }
  },
  "message": "Đăng ký thành công"
}
```

**Error Responses:**

```json
{
  "success": false,
  "code": "AUTH_INVALID_EMAIL",
  "message": "Email không hợp lệ",
  "status": 400
}
```

```json
{
  "success": false,
  "code": "AUTH_USERNAME_EXISTS",
  "message": "Username đã tồn tại",
  "status": 409
}
```

---

### 2. Đăng Nhập

**Endpoint:**

```http
POST /auth/login
Content-Type: application/json
```

**Request Body:**

```json
{
  "username": "john_doe",
  "password": "SecurePassword123!"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "AUTH_LOGIN_SUCCESS",
  "data": {
    "accessToken": "eyJhbGc...",
    "refreshToken": "eyJhbGc...",
    "expiresIn": 86400,
    "user": {
      "id": "507f1f77bcf86cd799439011",
      "username": "john_doe",
      "email": "john@example.com",
      "displayName": "John Doe",
      "role": "user"
    }
  },
  "message": "Đăng nhập thành công"
}
```

**Error Response:**

```json
{
  "success": false,
  "code": "AUTH_INVALID_CREDENTIALS",
  "message": "Username hoặc password không đúng",
  "status": 401
}
```

---

### 3. Làm Mới Token

**Endpoint:**

```http
POST /auth/refresh
Content-Type: application/json
```

**Request Body:**

```json
{
  "refreshToken": "eyJhbGc..."
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "AUTH_REFRESH_SUCCESS",
  "data": {
    "accessToken": "eyJhbGc...",
    "expiresIn": 86400
  },
  "message": "Làm mới token thành công"
}
```

---

### 4. Đăng Xuất

**Endpoint:**

```http
POST /auth/logout
Authorization: Bearer {JWT_TOKEN}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "AUTH_LOGOUT_SUCCESS",
  "message": "Đăng xuất thành công"
}
```

---

## 👥 Endpoint Người Dùng

### 1. Lấy Thông Tin Cá Nhân

**Endpoint:**

```http
GET /users/me
Authorization: Bearer {JWT_TOKEN}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "USER_PROFILE_SUCCESS",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "username": "john_doe",
    "email": "john@example.com",
    "displayName": "John Doe",
    "avatar": "https://r2.yourdomain.com/avatars/user123.webp",
    "bio": "Music lover",
    "role": "user",
    "createdAt": "2026-04-07T10:00:00Z",
    "lastLoginAt": "2026-04-07T10:30:00Z",
    "stats": {
      "totalPlays": 1234,
      "totalPlaylistsCreated": 5,
      "totalFollowers": 10
    }
  },
  "message": "Lấy thông tin thành công"
}
```

---

### 2. Cập Nhật Thông Tin Cá Nhân

**Endpoint:**

```http
PUT /users/me
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body:**

```json
{
  "displayName": "John Doe Updated",
  "bio": "I love music",
  "avatar": "https://r2.yourdomain.com/avatars/new-avatar.webp"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "USER_UPDATE_SUCCESS",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "displayName": "John Doe Updated",
    "bio": "I love music",
    "avatar": "https://r2.yourdomain.com/avatars/new-avatar.webp",
    "updatedAt": "2026-04-07T11:00:00Z"
  },
  "message": "Cập nhật thông tin thành công"
}
```

---

### 3. Đổi Mật Khẩu

**Endpoint:**

```http
POST /users/change-password
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body:**

```json
{
  "oldPassword": "OldPassword123!",
  "newPassword": "NewPassword456!",
  "confirmPassword": "NewPassword456!"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "USER_PASSWORD_CHANGED",
  "message": "Đổi mật khẩu thành công"
}
```

---

## 🎵 Endpoint Bài Hát

### 1. Danh Sách Bài Hát

**Endpoint:**

```http
GET /songs?page=1&limit=20&sort=createdAt&order=desc
Authorization: Bearer {JWT_TOKEN}
```

**Query Parameters:**

| Tham Số  | Kiểu   | Mô Tả                                           | Mặc Định    |
| :------- | :----- | :---------------------------------------------- | :---------- |
| `page`   | number | Trang (bắt đầu từ 1)                            | 1           |
| `limit`  | number | Số bài hát/trang                                | 20          |
| `sort`   | string | Sắp xếp theo: `title`, `createdAt`, `playCount` | `createdAt` |
| `order`  | string | Thứ tự: `asc`, `desc`                           | `desc`      |
| `genre`  | string | Lọc theo thể loại                               | -           |
| `search` | string | Tìm kiếm (title, artist)                        | -           |

**Response (200 OK):**

```json
{
  "success": true,
  "code": "SONGS_LIST_SUCCESS",
  "data": {
    "songs": [
      {
        "id": "507f1f77bcf86cd799439011",
        "title": "Bohemian Rhapsody",
        "artist": {
          "id": "507f1f77bcf86cd799439012",
          "name": "Queen"
        },
        "album": "A Night at the Opera",
        "duration": 354,
        "genre": "Rock",
        "releaseDate": "1975-10-31",
        "playCount": 1234,
        "likeCount": 567,
        "thumbnail": {
          "small": "https://r2.yourdomain.com/songs/abc/cover_100x100.webp",
          "large": "https://r2.yourdomain.com/songs/abc/cover_500x500.webp"
        },
        "blurHash": "UeKUp000p!00$K$K,_$",
        "createdAt": "2026-04-07T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 5000,
      "totalPages": 250,
      "hasMore": true
    }
  },
  "message": "Lấy danh sách bài hát thành công"
}
```

---

### 2. Chi Tiết Bài Hát

**Endpoint:**

```http
GET /songs/:songId
Authorization: Bearer {JWT_TOKEN}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "SONG_DETAILS_SUCCESS",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Bohemian Rhapsody",
    "artist": {
      "id": "507f1f77bcf86cd799439012",
      "name": "Queen",
      "bio": "British rock band",
      "avatar": "https://r2.yourdomain.com/artists/queen.webp"
    },
    "album": "A Night at the Opera",
    "duration": 354,
    "genre": "Rock",
    "releaseDate": "1975-10-31",
    "description": "A masterpiece of rock music",
    "lyrics": "Is this the real life? Is this just fantasy?...",
    "playCount": 1234,
    "likeCount": 567,
    "shareCount": 89,
    "isLiked": false,
    "thumbnail": {
      "small": "https://r2.yourdomain.com/songs/abc/cover_100x100.webp",
      "large": "https://r2.yourdomain.com/songs/abc/cover_500x500.webp"
    },
    "blurHash": "UeKUp000p!00$K$K,_$",
    "waveform": [0.1, 0.2, 0.3, ...],
    "createdAt": "2026-04-07T10:00:00Z",
    "updatedAt": "2026-04-07T10:00:00Z"
  },
  "message": "Lấy chi tiết bài hát thành công"
}
```

---

### 3. Tìm Kiếm Bài Hát

**Endpoint:**

```http
GET /songs/search?q=bohemian&type=all&limit=10
Authorization: Bearer {JWT_TOKEN}
```

**Query Parameters:**

| Tham Số | Kiểu   | Mô Tả                                     |
| :------ | :----- | :---------------------------------------- |
| `q`     | string | Chuỗi tìm kiếm (bắt buộc)                 |
| `type`  | string | Loại: `all`, `songs`, `artists`, `albums` |
| `limit` | number | Số kết quả (mặc định: 10, tối đa: 50)     |

**Response (200 OK):**

```json
{
  "success": true,
  "code": "SEARCH_SUCCESS",
  "data": {
    "results": [
      {
        "type": "song",
        "id": "507f1f77bcf86cd799439011",
        "title": "Bohemian Rhapsody",
        "artist": "Queen",
        "thumbnail": "https://r2.yourdomain.com/...",
        "blurHash": "UeKUp000p!00$K$K,_$"
      },
      {
        "type": "artist",
        "id": "507f1f77bcf86cd799439012",
        "name": "Queen",
        "avatar": "https://r2.yourdomain.com/..."
      }
    ]
  },
  "message": "Tìm kiếm thành công"
}
```

---

### 4. Thích/Không Thích Bài Hát

**Endpoint (Thích):**

```http
POST /songs/:songId/like
Authorization: Bearer {JWT_TOKEN}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "SONG_LIKED",
  "data": {
    "songId": "507f1f77bcf86cd799439011",
    "isLiked": true,
    "likeCount": 568
  },
  "message": "Bài hát đã được thích"
}
```

**Endpoint (Không Thích):**

```http
DELETE /songs/:songId/like
Authorization: Bearer {JWT_TOKEN}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "SONG_UNLIKED",
  "data": {
    "songId": "507f1f77bcf86cd799439011",
    "isLiked": false,
    "likeCount": 567
  },
  "message": "Bài hát đã bỏ thích"
}
```

---

## 🎶 Endpoint Streaming

### 1. Lấy Manifest HLS

**Endpoint:**

```http
GET /stream/manifest/:songId
Authorization: Bearer {JWT_TOKEN}
Device-FP: {device_fingerprint_hash}
X-Request-ID: {correlation_id}
```

**Response (200 OK):**

```http
Content-Type: application/x-mpegURL
Cache-Control: no-cache, must-revalidate
Set-Cookie: hls_session={signed_cookie}; HttpOnly; Secure; Max-Age=1800; SameSite=Strict

#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:4
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="https://api.yourdomain.com/api/v1/stream/key/507f1f77bcf86cd799439011",IV=0x1A2B3C4D5E6F7G8H9I0J1K2L3M4N
#EXT-X-STREAM-INF:BANDWIDTH=128000,CODECS="mp4a.40.2",RESOLUTION=0x0
128k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=192000,CODECS="mp4a.40.2",RESOLUTION=0x0
192k/playlist.m3u8
#EXT-X-STREAM-INF:BANDWIDTH=320000,CODECS="mp4a.40.2",RESOLUTION=0x0
320k/playlist.m3u8
```

**Error Responses:**

```json
{
  "success": false,
  "code": "SONG_NOT_FOUND",
  "message": "Bài hát không tồn tại",
  "status": 404
}
```

```json
{
  "success": false,
  "code": "STREAMING_NOT_AVAILABLE",
  "message": "Bài hát không sẵn sàng phát (chưa xử lý xong)",
  "status": 412
}
```

---

### 2. Lấy Khóa Giải Mã

**Endpoint:**

```http
GET /stream/key/:songId
Authorization: Bearer {JWT_TOKEN}
Device-FP: {device_fingerprint_hash}
X-Request-Timestamp: {unix_timestamp}
```

**Response (200 OK):**

```http
Content-Type: application/octet-stream
Cache-Control: no-cache, no-store, must-revalidate
X-Content-Type-Options: nosniff

[16 bytes binary AES-128 key]
```

**Error Responses:**

```json
{
  "success": false,
  "code": "DEVICE_BINDING_FAILED",
  "message": "Thiết bị không khớp. Tài khoản bị khóa vì nhiều nỗ lực thất bại",
  "status": 403,
  "retryAfter": 3600
}
```

```json
{
  "success": false,
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Vượt quá giới hạn yêu cầu khóa. Vui lòng thử lại sau",
  "status": 429,
  "retryAfter": 10
}
```

---

### 3. Ghi Lịch Sử Nghe

**Endpoint:**

```http
POST /stream/history
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body:**

```json
{
  "songId": "507f1f77bcf86cd799439011",
  "duration": 354,
  "completionRate": 85,
  "selectedBitrate": "192k",
  "deviceFingerprint": "fp_hash_device_1"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "code": "HISTORY_RECORDED",
  "data": {
    "historyId": "history_uuid_123",
    "songId": "507f1f77bcf86cd799439011",
    "playedAt": "2026-04-07T10:30:00Z"
  },
  "message": "Lịch sử nghe đã được ghi"
}
```

---

## 📋 Endpoint Playlist

### 1. Danh Sách Playlist của Người Dùng

**Endpoint:**

```http
GET /playlists?page=1&limit=10
Authorization: Bearer {JWT_TOKEN}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "PLAYLISTS_LIST_SUCCESS",
  "data": {
    "playlists": [
      {
        "id": "playlist_uuid_1",
        "userId": "507f1f77bcf86cd799439011",
        "name": "Nhạc Rock Yêu Thích",
        "description": "Những bài hát rock mà tôi yêu thích nhất",
        "songCount": 25,
        "totalDuration": 7200,
        "thumbnail": "https://r2.yourdomain.com/playlists/pl1.webp",
        "isPublic": false,
        "followerCount": 0,
        "createdAt": "2026-04-07T10:00:00Z",
        "updatedAt": "2026-04-07T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 5,
      "hasMore": false
    }
  },
  "message": "Lấy danh sách playlist thành công"
}
```

---

### 2. Tạo Playlist Mới

**Endpoint:**

```http
POST /playlists
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Nhạc Pop Mới",
  "description": "Các bài nhạc pop mới nhất",
  "isPublic": false
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "code": "PLAYLIST_CREATED",
  "data": {
    "id": "playlist_uuid_2",
    "userId": "507f1f77bcf86cd799439011",
    "name": "Nhạc Pop Mới",
    "description": "Các bài nhạc pop mới nhất",
    "songCount": 0,
    "totalDuration": 0,
    "isPublic": false,
    "createdAt": "2026-04-07T11:00:00Z"
  },
  "message": "Tạo playlist thành công"
}
```

---

### 3. Thêm Bài Hát vào Playlist

**Endpoint:**

```http
POST /playlists/:playlistId/songs
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body:**

```json
{
  "songId": "507f1f77bcf86cd799439011"
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "SONG_ADDED_TO_PLAYLIST",
  "data": {
    "playlistId": "playlist_uuid_2",
    "songId": "507f1f77bcf86cd799439011",
    "songCount": 1,
    "totalDuration": 354
  },
  "message": "Thêm bài hát vào playlist thành công"
}
```

---

### 4. Xóa Bài Hát khỏi Playlist

**Endpoint:**

```http
DELETE /playlists/:playlistId/songs/:songId
Authorization: Bearer {JWT_TOKEN}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "SONG_REMOVED_FROM_PLAYLIST",
  "data": {
    "playlistId": "playlist_uuid_2",
    "songId": "507f1f77bcf86cd799439011",
    "songCount": 0,
    "totalDuration": 0
  },
  "message": "Xóa bài hát khỏi playlist thành công"
}
```

---

### 5. Cập Nhật Playlist

**Endpoint:**

```http
PUT /playlists/:playlistId
Authorization: Bearer {JWT_TOKEN}
Content-Type: application/json
```

**Request Body:**

```json
{
  "name": "Nhạc Pop Mới - Updated",
  "description": "Cập nhật danh sách nhạc pop",
  "isPublic": true
}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "PLAYLIST_UPDATED",
  "data": {
    "id": "playlist_uuid_2",
    "name": "Nhạc Pop Mới - Updated",
    "description": "Cập nhật danh sách nhạc pop",
    "isPublic": true,
    "updatedAt": "2026-04-07T11:30:00Z"
  },
  "message": "Cập nhật playlist thành công"
}
```

---

### 6. Xóa Playlist

**Endpoint:**

```http
DELETE /playlists/:playlistId
Authorization: Bearer {JWT_TOKEN}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "PLAYLIST_DELETED",
  "message": "Xóa playlist thành công"
}
```

---

## 🛠️ Endpoint Admin

### 1. Upload Bài Hát

**Endpoint:**

```http
POST /admin/upload
Authorization: Bearer {JWT_TOKEN}
X-Admin-Token: {admin_secret_key}
Content-Type: multipart/form-data
```

**Request Body (Form Data):**

```
file: [binary MP3/FLAC/WAV file]
title: "Bài Hát Mới"
artist: "Nghệ Sĩ"
album: "Album"
genre: "Rock"
releaseDate: "2026-04-07"
```

**Response (202 Accepted):**

```json
{
  "success": true,
  "code": "UPLOAD_QUEUED",
  "data": {
    "jobId": "job_uuid_12345",
    "songId": "song_uuid_abc123",
    "status": "processing",
    "progress": 0,
    "estimatedTime": "120-300",
    "message": "Upload được queue cho xử lý"
  },
  "message": "Upload thành công, vui lòng chờ xử lý"
}
```

**Error Response:**

```json
{
  "success": false,
  "code": "UPLOAD_FILE_TOO_LARGE",
  "message": "File vượt quá giới hạn 500MB",
  "status": 413
}
```

---

### 2. Kiểm Tra Trạng Thái Job

**Endpoint:**

```http
GET /admin/jobs/:jobId
Authorization: Bearer {JWT_TOKEN}
X-Admin-Token: {admin_secret_key}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "JOB_STATUS_SUCCESS",
  "data": {
    "jobId": "job_uuid_12345",
    "songId": "song_uuid_abc123",
    "status": "processing",
    "progress": 65,
    "startedAt": "2026-04-07T10:00:00Z",
    "estimatedCompletion": "2026-04-07T10:05:00Z",
    "log": "Đang transcode variant 192kbps... (45% hoàn thành)",
    "attempts": 1,
    "maxAttempts": 3
  },
  "message": "Lấy trạng thái job thành công"
}
```

**Job Statuses:**

| Status       | Ý Nghĩa    |
| :----------- | :--------- |
| `queued`     | Chờ xử lý  |
| `processing` | Đang xử lý |
| `completed`  | Hoàn thành |
| `failed`     | Thất bại   |
| `retry`      | Thử lại    |

---

### 3. Danh Sách Tất Cả Jobs

**Endpoint:**

```http
GET /admin/jobs?status=processing&limit=20
Authorization: Bearer {JWT_TOKEN}
X-Admin-Token: {admin_secret_key}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "JOBS_LIST_SUCCESS",
  "data": {
    "jobs": [
      {
        "jobId": "job_uuid_12345",
        "songId": "song_uuid_abc123",
        "status": "processing",
        "progress": 65,
        "createdAt": "2026-04-07T10:00:00Z"
      }
    ],
    "pagination": {
      "page": 1,
      "limit": 20,
      "total": 50,
      "hasMore": true
    }
  },
  "message": "Lấy danh sách jobs thành công"
}
```

---

### 4. Xóa Bài Hát

**Endpoint:**

```http
DELETE /admin/songs/:songId
Authorization: Bearer {JWT_TOKEN}
X-Admin-Token: {admin_secret_key}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "SONG_DELETED",
  "data": {
    "songId": "507f1f77bcf86cd799439011",
    "deletedAt": "2026-04-07T11:00:00Z"
  },
  "message": "Xóa bài hát thành công"
}
```

---

### 5. Thống Kê Hệ Thống

**Endpoint:**

```http
GET /admin/stats
Authorization: Bearer {JWT_TOKEN}
X-Admin-Token: {admin_secret_key}
```

**Response (200 OK):**

```json
{
  "success": true,
  "code": "STATS_SUCCESS",
  "data": {
    "songs": {
      "total": 5000,
      "processing": 10,
      "ready": 4980,
      "failed": 10
    },
    "users": {
      "total": 50000,
      "activeToday": 2500,
      "activeThisMonth": 25000
    },
    "streaming": {
      "totalPlays": 1000000,
      "totalPlayTime": 50000000,
      "uniqueListeners": 35000,
      "peakConcurrentUsers": 5000
    },
    "storage": {
      "totalSize": 1099511627776,
      "usedSize": 549755813888,
      "percentageUsed": 50
    },
    "bandwidth": {
      "totalBandwidth": 1099511627776,
      "usedBandwidth": 0,
      "costPerGB": 0
    },
    "timestamp": "2026-04-07T11:00:00Z"
  },
  "message": "Lấy thống k�� thành công"
}
```

---

## ❌ Error Handling

### Error Response Format

```json
{
  "success": false,
  "code": "ERROR_CODE",
  "message": "Chi tiết lỗi",
  "status": 400,
  "details": {
    "field": "Tên trường",
    "error": "Mô tả lỗi"
  },
  "requestId": "uuid-correlation-id",
  "timestamp": "2026-04-07T10:00:00Z"
}
```

### Error Codes

| Code                       | Status | Ý Nghĩa                           |
| :------------------------- | :----- | :-------------------------------- |
| `AUTH_INVALID_EMAIL`       | 400    | Email không hợp lệ                |
| `AUTH_USERNAME_EXISTS`     | 409    | Username đã tồn tại               |
| `AUTH_INVALID_CREDENTIALS` | 401    | Username hoặc password không đúng |
| `AUTH_UNAUTHORIZED`        | 401    | Không có quyền truy cập           |
| `AUTH_TOKEN_EXPIRED`       | 401    | Token đã hết hạn                  |
| `AUTH_INVALID_TOKEN`       | 401    | Token không hợp lệ                |
| `DEVICE_BINDING_FAILED`    | 403    | Thiết bị không khớp               |
| `SONG_NOT_FOUND`           | 404    | Bài hát không tồn tại             |
| `PLAYLIST_NOT_FOUND`       | 404    | Playlist không tồn tại            |
| `USER_NOT_FOUND`           | 404    | Người dùng không tồn tại          |
| `STREAMING_NOT_AVAILABLE`  | 412    | Bài hát không sẵn sàng phát       |
| `RATE_LIMIT_EXCEEDED`      | 429    | Vượt quá giới hạn yêu cầu         |
| `UPLOAD_FILE_TOO_LARGE`    | 413    | File vượt quá giới hạn            |
| `INVALID_FILE_FORMAT`      | 400    | Định dạng file không hỗ trợ       |
| `INTERNAL_SERVER_ERROR`    | 500    | Lỗi máy chủ                       |
| `SERVICE_UNAVAILABLE`      | 503    | Dịch vụ không khả dụng            |

---

## 🚦 Rate Limiting

### Các Giới Hạn

| Endpoint     | Giới Hạn    | Cửa Sổ Thời Gian |
| :----------- | :---------- | :--------------- |
| Login/Signup | 5 requests  | 15 phút          |
| Lấy Khóa     | 5 requests  | 10 giây          |
| Manifest     | 20 requests | 1 phút           |
| Tìm Kiếm     | 30 requests | 1 phút           |
| Upload       | 5 uploads   | 1 phút           |

### Rate Limit Headers

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1680854400
Retry-After: 60
```

---

## ✅ Status Codes

| Code    | Ý Nghĩa                                                  |
| :------ | :------------------------------------------------------- |
| **200** | OK - Yêu cầu thành công                                  |
| **201** | Created - Tài nguyên được tạo                            |
| **202** | Accepted - Yêu cầu được chấp nhận, xử lý bất đồng bộ     |
| **204** | No Content - Thành công nhưng không có nội dung trả về   |
| **400** | Bad Request - Yêu cầu không hợp lệ                       |
| **401** | Unauthorized - Không được xác thực                       |
| **403** | Forbidden - Không có quyền truy cập                      |
| **404** | Not Found - Không tìm thấy                               |
| **409** | Conflict - Xung đột (ví dụ: username đã tồn tại)         |
| **412** | Precondition Failed - Điều kiện trước không được đáp ứng |
| **413** | Payload Too Large - File quá lớn                         |
| **429** | Too Many Requests - Vượt quá giới hạn                    |
| **500** | Internal Server Error - Lỗi máy chủ                      |
| **503** | Service Unavailable - Dịch vụ không khả dụng             |

---

## 📚 Ví Dụ Curl

### Đăng Ký

```bash
curl -X POST https://api.yourdomain.com/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "email": "john@example.com",
    "password": "SecurePassword123!",
    "displayName": "John Doe"
  }'
```

### Đăng Nhập

```bash
curl -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "SecurePassword123!"
  }'
```

### Lấy Manifest

```bash
curl -X GET https://api.yourdomain.com/api/v1/stream/manifest/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer eyJhbGc..." \
  -H "Device-FP: device_fingerprint_hash" \
  -H "X-Request-ID: uuid-12345"
```

### Danh Sách Bài Hát

```bash
curl -X GET 'https://api.yourdomain.com/api/v1/songs?page=1&limit=20' \
  -H "Authorization: Bearer eyJhbGc..."
```

---

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07  
**Status:** Production Ready
