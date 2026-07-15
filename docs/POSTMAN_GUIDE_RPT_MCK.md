# Hướng dẫn tạo data nghệ sĩ RPT MCK + Album HVL

> Base URL: `http://localhost:9999`
> Tất cả endpoint admin yêu cầu header: `Authorization: Bearer <access_token>`
> Account phải có role `SUPER_ADMIN` + permission `catalog.manage`

---

## Tổng quan quy trình

Frontend trang artist gọi **3 API song song**:

```
GET /catalog/vn/artists/:artistId        → thông tin nghệ sĩ
GET /catalog/vn/artists/:artistId/albums  → danh sách album
GET /catalog/vn/artists/:artistId/songs   → danh sách bài hát
```

Để 3 API này trả về data, cần tạo data theo **đúng thứ tự**:

```
1. Upload artwork (ảnh nghệ sĩ, ảnh album) → lấy artworkAssetId
2. Tạo Artist draft → Publish → có Artist trong catalog
3. Tạo Song records (upload bài hát qua pipeline) → Song có status READY
4. Tạo Song drafts → Publish → Song có trong catalog
5. Tạo Album draft (gắn tracks + artistIds) → Publish → Album có trong catalog
```

**Lưu ý quan trọng:**
- **Song draft** yêu cầu `resourceId` là ID của Song record đã tồn tại với `status = READY` (phải upload qua pipeline trước)
- **Publish** yêu cầu `artworkAssetId` trỏ tới Asset có `status = READY` (phải upload artwork trước)
- **Album publish** yêu cầu tất cả `artistIds` đã được publish, tất cả `tracks[].songId` là catalog song đã publish

---

## Bước 1: Upload Artwork

Tất cả artwork (ảnh nghệ sĩ, ảnh album, ảnh bài hát) đều dùng **cùng 1 endpoint, cùng 1 body format**.
Asset system không phân biệt ảnh dùng cho artist hay album — chỉ phân biệt khi publish catalog draft.

**Endpoint:** `POST /admin/assets/uploads`

**Giá trị hợp lệ:**

| kind | purpose | Dùng cho |
|------|---------|----------|
| `IMAGE` | `ARTWORK` | Ảnh nghệ sĩ, ảnh album, ảnh bài hát, ảnh playlist |
| `VIDEO` | `EDITORIAL_VIDEO` | Video ngắn header trang nghệ sĩ |

Chỉ 2 cặp này — ghép lẫn (vd `IMAGE` + `EDITORIAL_VIDEO`) sẽ bị reject.

**Content types được chấp nhận:**
- Image: `image/jpeg`, `image/png`, `image/webp`, `image/avif` (tối đa 20 MB)
- Video: `video/mp4`, `video/quicktime`, `video/webm` (tối đa 500 MB)

### 1a. Request upload ảnh nghệ sĩ RPT MCK

```
POST /admin/assets/uploads
Content-Type: application/json
```

```json
{
  "kind": "IMAGE",
  "purpose": "ARTWORK",
  "filename": "rpt-mck-artwork.webp",
  "contentType": "image/webp",
  "checksum": "<SHA-256 hex của file ảnh>",
  "sizeBytes": 123456
}
```

→ Response:
```json
{
  "assetId": "asset-xxx-001",
  "uploadUrl": "https://r2.example.com/presigned-upload-url...",
  "instant": false
}
```

### 1b. Upload file thực tế lên R2

```
PUT <uploadUrl từ response trên>
Content-Type: image/webp
Body: <binary file>
```

### 1c. Finalize upload

```
POST /admin/assets/asset-xxx-001/finalize
```

→ Asset chuyển sang `PROCESSING`, sau đó tự động chuyển `READY`.

### 1d. Lặp lại cho ảnh album HVL

```
POST /admin/assets/uploads
Content-Type: application/json
```

```json
{
  "kind": "IMAGE",
  "purpose": "ARTWORK",
  "filename": "hvl-album-artwork.webp",
  "contentType": "image/webp",
  "checksum": "<SHA-256 hex của file ảnh album>",
  "sizeBytes": 27236
}
```

→ Upload file → Finalize → Ghi lại `assetId` cho album draft.

### 1e. (Tuỳ chọn) Upload editorial video nghệ sĩ

```
POST /admin/assets/uploads
Content-Type: application/json
```

```json
{
  "kind": "VIDEO",
  "purpose": "EDITORIAL_VIDEO",
  "filename": "rpt-mck-editorial.mp4",
  "contentType": "video/mp4",
  "checksum": "<SHA-256 hex của file video>",
  "sizeBytes": 5242880
}
```

→ Upload file → Finalize → Ghi lại `assetId` làm `editorialVideoAssetId` cho artist draft.

### Tóm tắt sau bước 1

Ghi lại các ID:
- `ARTIST_ARTWORK_ASSET_ID` — assetId của ảnh nghệ sĩ
- `ALBUM_ARTWORK_ASSET_ID` — assetId của ảnh album
- `EDITORIAL_VIDEO_ASSET_ID` — assetId của video (nếu có)

---

## Bước 2: Tạo & Publish Artist — RPT MCK

### 2a. Tạo Artist Draft

```
POST /admin/catalog/artists/draft
Content-Type: application/json
```

```json
{
  "storefront": "vn",
  "name": "RPT MCK",
  "url": "rpt-mck",
  "genreNames": ["Hip-Hop/Rap"],
  "artworkAssetId": "<ARTIST_ARTWORK_ASSET_ID>",
  "editorialVideoAssetId": "<EDITORIAL_VIDEO_ASSET_ID hoặc bỏ trống>"
}
```

→ Response trả về `draftId` và `resourceId` (chính là Artist ID). **Ghi lại cả hai.**

**Response mẫu:**
```json
{
  "draftId": "draft-xxx-xxx",
  "resourceId": "artist-xxx-xxx",
  "resourceType": "artists",
  "storefront": "vn",
  "status": "DRAFT",
  "version": 1
}
```

### 2b. Publish Artist Draft

```
POST /admin/catalog/drafts/<draftId>/publish
```

Không cần body. Chỉ cần `draftId` ở URL.

→ Sau khi publish, Artist đã tồn tại trong catalog. Ghi lại `resourceId` → đây là `ARTIST_ID` dùng cho các bước sau.

---

## Bước 3: Upload audio → Tạo Song Records

**Tại sao cần bước này?**
Endpoint `/admin/catalog/songs/draft` (bước 4) **không tạo bài hát mới** — nó chỉ gắn metadata
catalog chính thức cho một Song record **đã có sẵn** trong DB với `status = READY`.
Song record đó được tạo thông qua pipeline upload bài hát.

```
/songs/request-upload  →  tạo Song record (PENDING)
                            ↓
        Upload file audio lên R2 (presigned URL)
                            ↓
        R2 event → Finalizer → transcode queue
                            ↓
        Rust Worker: transcode + encrypt → upload fMP4
                            ↓
        Song record chuyển status → READY ✓
                            ↓
/admin/catalog/songs/draft  →  gắn metadata catalog cho songId đó
```

### 3a. Request upload — Lặp lại cho mỗi bài hát

```
POST /songs/request-upload
Content-Type: application/json
Authorization: Bearer <access_token>
```

```json
{
  "title": "Elegie",
  "checksum": "<SHA-256 hex của file audio>",
  "size": 3724508
}
```

> Các trường `artist`, `album`, `isPublic` là **optional**, chỉ là metadata cá nhân
> của user uploader (thư viện cá nhân), **không liên quan gì tới catalog**.
> Có thể bỏ trống hoặc điền tuỳ ý.

→ Response:
```json
{
  "songId": "song-xxx-001",
  "instant": false,
  "uploadUrl": "https://r2.example.com/quarantine/presigned-url..."
}
```

**Ghi lại `songId`** — đây chính là `resourceId` dùng cho bước 4.

### 3b. Upload file audio lên R2

```
PUT <uploadUrl từ response trên>
Content-Type: application/octet-stream
Body: <binary audio file (MP3/WAV/FLAC...)>
```

### 3c. Chờ pipeline xử lý

Sau khi upload, pipeline tự động chạy:
1. R2 event → Cloudflare Finalizer Worker → gọi API `/finalize-upload`
2. Rust Worker nhận job từ `transcode_queue` → transcode + encrypt
3. Song status chuyển từ `PENDING` → `PROCESSING` → `READY`

Kiểm tra status bài hát:
```
GET /songs/<songId>/status
```

Chờ đến khi `status = "READY"` rồi mới chuyển sang bước 4.

### 3d. Lặp lại cho tất cả bài hát cần tạo

Mỗi bài hát cần 1 file audio riêng (checksum khác nhau). Body mẫu cho vài bài đầu:

**Elegie:**
```json
{ "title": "Elegie", "checksum": "<sha256-file-1>", "size": 3724508 }
```

**IDK:**
```json
{ "title": "IDK", "checksum": "<sha256-file-2>", "size": 4102400 }
```

**Wtf Bby I'm Lit:**
```json
{ "title": "Wtf Bby I'm Lit", "checksum": "<sha256-file-3>", "size": 3850000 }
```

... tiếp tục cho các bài còn lại.

### Tóm tắt sau bước 3

Ghi lại mapping `songId` cho từng bài:

| Track | Title | songId |
|-------|-------|--------|
| 1 | Elegie | `song-xxx-001` |
| 2 | IDK | `song-xxx-002` |
| 3 | Wtf Bby I'm Lit | `song-xxx-003` |
| ... | ... | ... |

Các `songId` này sẽ dùng làm `resourceId` trong bước 4 (catalog song draft)
và `tracks[].songId` trong bước 5 (album draft).

---

## Bước 4: Tạo & Publish Song Drafts

Lặp lại cho **mỗi bài hát**. Dưới đây là body mẫu cho từng bài trong album HVL.

### Template chung cho Song Draft

```
POST /admin/catalog/songs/draft
Content-Type: application/json
```

```json
{
  "resourceId": "<SONG_ID từ bước 3>",
  "storefront": "vn",
  "name": "<tên bài hát>",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": "<duration>",
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": "<số thứ tự>",
  "url": "<url-slug>",
  "artistIds": ["<ARTIST_ID từ bước 2>"],
  "composerIds": ["<ARTIST_ID từ bước 2>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

### Body cho từng bài (thay `resourceId` bằng songId thực tế)

**Track 1 — Elegie**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Elegie",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 1,
  "url": "elegie",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 2 — IDK**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "IDK",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "explicit",
  "discNumber": 1,
  "durationInMillis": 196000,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 2,
  "url": "idk",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 3 — Wtf Bby I'm Lit**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Wtf Bby I'm Lit",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 166829,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 3,
  "url": "wtf-bby-im-lit",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 4 — Anh Không Muốn Nó Dễ Dàng**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Anh Không Muốn Nó Dễ Dàng",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 165248,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 4,
  "url": "anh-khong-muon-no-de-dang",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 5 — Baby (feat. marzuz)**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Baby (feat. marzuz)",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 173403,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 5,
  "url": "baby-feat-marzuz",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 6 — Yêu Anh Giết Anh**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Yêu Anh Giết Anh",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 165493,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 6,
  "url": "yeu-anh-giet-anh",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 7 — Mắt Môi Tay Chân (feat. Tage)**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Mắt Môi Tay Chân (feat. Tage)",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 192485,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 7,
  "url": "mat-moi-tay-chan-feat-tage",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 8 — Đao Của Anh Vừa**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Đao Của Anh Vừa",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 124469,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 8,
  "url": "dao-cua-anh-vua",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 9 — Là Gì Của Nhau**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Là Gì Của Nhau",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 142523,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 9,
  "url": "la-gi-cua-nhau",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 10 — Night In Prague**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Night In Prague",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 213717,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 10,
  "url": "night-in-prague",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 11 — Một Cái Ôm**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Một Cái Ôm",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 201781,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 11,
  "url": "mot-cai-om",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 12 — Liệm**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Liệm",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 233250,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 12,
  "url": "liem",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 13 — Nếu Như Ta Chẳng Còn (feat. A$AP Ướt Mi)**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Nếu Như Ta Chẳng Còn (feat. A$AP Ướt Mi)",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 317972,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 13,
  "url": "neu-nhu-ta-chang-con-feat-asap-uot-mi",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 14 — Ai Mới Là Kẻ Xấu Xa**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Ai Mới Là Kẻ Xấu Xa",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 192768,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 14,
  "url": "ai-moi-la-ke-xau-xa",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 15 — Slippery (feat. Tùng Dương)**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Slippery (feat. Tùng Dương)",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 215486,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 15,
  "url": "slippery-feat-tung-duong",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 16 — Intenpol**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Intenpol",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 53515,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 16,
  "url": "intenpol",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 17 — Tây Thi**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Tây Thi",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 104384,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 17,
  "url": "tay-thi",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 18 — Hút và Hút**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Hút và Hút",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 134731,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 18,
  "url": "hut-va-hut",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 19 — Dưa Chua**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Dưa Chua",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 182352,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 19,
  "url": "dua-chua",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 20 — Xa Xôi (feat. Obito)**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Xa Xôi (feat. Obito)",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 217547,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 20,
  "url": "xa-xoi-feat-obito",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 21 — Che Phủ**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Che Phủ",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 155483,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 21,
  "url": "che-phu",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 22 — Oanh M = Thuoc**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Oanh M = Thuoc",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 22,
  "url": "oanh-m-thuoc",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 23 — Ghét Xong Lại Thích...**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Ghét Xong Lại Thích...",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 23,
  "url": "ghet-xong-lai-thich",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 24 — Nhìn Kẻ Thù Của Tao**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Nhìn Kẻ Thù Của Tao",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 234152,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 24,
  "url": "nhin-ke-thu-cua-tao",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 25 — Envy (feat. THANHDRAW)**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Envy (feat. THANHDRAW)",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 25,
  "url": "envy-feat-thanhdraw",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 26 — Cảm Ơn**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Cảm Ơn",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 26,
  "url": "cam-on",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 27 — Không Cần Lo Cho Tao**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Không Cần Lo Cho Tao",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 27,
  "url": "khong-can-lo-cho-tao",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 28 — Huh (feat. RPT ORIJINN & THANHDRAW)**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Huh (feat. RPT ORIJINN & THANHDRAW)",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 28,
  "url": "huh-feat-rpt-orijinn-thanhdraw",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 29 — Nguyễn Văn Mười**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Nguyễn Văn Mười",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 242144,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 29,
  "url": "nguyen-van-muoi",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

**Track 30 — Thịt Lợn**
```json
{
  "resourceId": "<SONG_ID>",
  "storefront": "vn",
  "name": "Thịt Lợn",
  "albumName": "HVL",
  "artistName": "RPT MCK",
  "audioLocale": "vi",
  "audioTraits": ["lossless"],
  "composerName": "Nghiêm Vũ Hoàng Long",
  "contentRating": "",
  "discNumber": 1,
  "durationInMillis": 228341,
  "genreNames": ["Hip-Hop/Rap"],
  "hasLyrics": true,
  "hasTimeSyncedLyrics": false,
  "isrc": "",
  "releaseDate": "2026-06-17",
  "trackNumber": 30,
  "url": "thit-lon",
  "artistIds": ["<ARTIST_ID>"],
  "composerIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>"
}
```

### Publish từng Song Draft

Sau khi tạo mỗi song draft, gọi publish:

```
POST /admin/catalog/drafts/<song_draftId>/publish
```

**Lặp lại cho tất cả 30 bài.**

---

## Bước 5: Tạo & Publish Album — HVL

### 5a. Tạo Album Draft

```
POST /admin/catalog/albums/draft
Content-Type: application/json
```

```json
{
  "storefront": "vn",
  "name": "HVL",
  "artistName": "RPT MCK",
  "audioTraits": ["lossless"],
  "contentRating": "",
  "copyright": "℗ 2026 311synd",
  "genreNames": ["Hip-Hop/Rap"],
  "isCompilation": false,
  "isComplete": true,
  "isPrerelease": false,
  "isSingle": false,
  "recordLabel": "311synd",
  "releaseDate": "2026-06-17",
  "upc": "",
  "url": "hvl",
  "artistIds": ["<ARTIST_ID>"],
  "artworkAssetId": "<ALBUM_ARTWORK_ASSET_ID>",
  "tracks": [
    { "songId": "<SONG_ID_TRACK_1>",  "position": 0,  "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_2>",  "position": 1,  "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_3>",  "position": 2,  "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_4>",  "position": 3,  "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_5>",  "position": 4,  "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_6>",  "position": 5,  "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_7>",  "position": 6,  "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_8>",  "position": 7,  "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_9>",  "position": 8,  "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_10>", "position": 9,  "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_11>", "position": 10, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_12>", "position": 11, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_13>", "position": 12, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_14>", "position": 13, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_15>", "position": 14, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_16>", "position": 15, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_17>", "position": 16, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_18>", "position": 17, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_19>", "position": 18, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_20>", "position": 19, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_21>", "position": 20, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_22>", "position": 21, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_23>", "position": 22, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_24>", "position": 23, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_25>", "position": 24, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_26>", "position": 25, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_27>", "position": 26, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_28>", "position": 27, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_29>", "position": 28, "discNumber": 1 },
    { "songId": "<SONG_ID_TRACK_30>", "position": 29, "discNumber": 1 }
  ]
}
```

### 5b. Publish Album Draft

```
POST /admin/catalog/drafts/<album_draftId>/publish
```

---

## Bước 6: Kiểm tra kết quả

Sau khi hoàn thành, gọi 3 API public để xem data:

### Lấy thông tin nghệ sĩ
```
GET /catalog/vn/artists/<ARTIST_ID>
```

### Lấy danh sách album
```
GET /catalog/vn/artists/<ARTIST_ID>/albums
```

### Lấy danh sách bài hát
```
GET /catalog/vn/artists/<ARTIST_ID>/songs
```

---

## Tham khảo: Data gốc từ Apple Music

### Thông tin nghệ sĩ

| Field | Value |
|-------|-------|
| Tên | RPT MCK |
| Tên thật | Nghiêm Vũ Hoàng Long |
| Sinh | 2/3/1999 |
| Quê | Hà Nội, Việt Nam |
| Thể loại | Hip-Hop/Rap |
| Apple Music ID | 1533293457 |
| Artist artwork | 3039x3039, bgColor: `#141008` |
| textColor1 | `#f53f21` |
| textColor2 | `#f83a25` |
| textColor3 | `#c8361c` |
| textColor4 | `#ca321f` |

### Thông tin album HVL

| Field | Value |
|-------|-------|
| Tên | HVL |
| Ngày phát hành | 17/06/2026 |
| Số track | 30 |
| Label | 311synd |
| Apple Music Album ID | 6779205137 |
| Album artwork | 3000x3000, bgColor: `#02070c` |
| textColor1 | `#d9dee5` |
| textColor2 | `#ccd2d9` |
| textColor3 | `#aeb3b9` |
| textColor4 | `#a3aab0` |

### Tracklist đầy đủ với duration (ms)

| # | Tên bài | Duration (ms) | Apple ID |
|---|---------|--------------|----------|
| 1 | Elegie | — | — |
| 2 | IDK | 196,000 | 6779205342 |
| 3 | Wtf Bby I'm Lit | 166,829 | 6779205344 |
| 4 | Anh Không Muốn Nó Dễ Dàng | 165,248 | 6779205346 |
| 5 | Baby (feat. marzuz) | 173,403 | 6779205348 |
| 6 | Yêu Anh Giết Anh | 165,493 | 6779205350 |
| 7 | Mắt Môi Tay Chân (feat. Tage) | 192,485 | 6779205353 |
| 8 | Đao Của Anh Vừa | 124,469 | 6779205354 |
| 9 | Là Gì Của Nhau | 142,523 | 6779205664 |
| 10 | Night In Prague | 213,717 | 6779205666 |
| 11 | Một Cái Ôm | 201,781 | 6779205668 |
| 12 | Liệm | 233,250 | 6779205674 |
| 13 | Nếu Như Ta Chẳng Còn (feat. A$AP Ướt Mi) | 317,972 | 6779205675 |
| 14 | Ai Mới Là Kẻ Xấu Xa | 192,768 | 6773655703 |
| 15 | Slippery (feat. Tùng Dương) | 215,486 | 6779205685 |
| 16 | Intenpol | 53,515 | 6779205686 |
| 17 | Tây Thi | 104,384 | 6779205687 |
| 18 | Hút và Hút | 134,731 | 6779205688 |
| 19 | Dưa Chua | 182,352 | 6779205689 |
| 20 | Xa Xôi (feat. Obito) | 217,547 | 6779205691 |
| 21 | Che Phủ | 155,483 | 6779205884 |
| 22 | Oanh M = Thuoc | — | — |
| 23 | Ghét Xong Lại Thích... | — | — |
| 24 | Nhìn Kẻ Thù Của Tao | 234,152 | 6779205967 |
| 25 | Envy (feat. THANHDRAW) | — | — |
| 26 | Cảm Ơn | — | — |
| 27 | Không Cần Lo Cho Tao | — | — |
| 28 | Huh (feat. RPT ORIJINN & THANHDRAW) | — | — |
| 29 | Nguyễn Văn Mười | 242,144 | 6779206285 |
| 30 | Thịt Lợn | 228,341 | 6779206290 |

> Các bài đánh dấu `—` ở duration không có trên trang Apple Music artist page (chỉ có trong album page).

---

## Lưu ý cho Frontend

Nếu chỉ muốn **test giao diện nhanh** mà chưa muốn đi qua full pipeline:

1. **Artist**: có thể tạo & publish được ngay (chỉ cần artwork asset)
2. **Songs**: cần Song records có sẵn trong DB với status READY — không thể bỏ qua bước upload
3. **Album**: cần artist đã publish + songs đã publish trong catalog

Gợi ý: upload 5-10 file audio ngắn (MP3) qua pipeline trước, lấy songId, rồi tạo catalog drafts cho 5-10 bài đó. Đủ để test giao diện trang artist.
