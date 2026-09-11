# Báo cáo rà soát database trước production

> Cập nhật: 31/08/2026  
> Mục tiêu: dọn schema trước khi xóa dữ liệu development và mở cho người dùng thật.

## 1. Phạm vi và độ tin cậy

| Database | Service sở hữu | Mức rà soát |
|---|---|---|
| `music_song_db` | Song / Catalog | Đã kết nối PostgreSQL trực tiếp: bảng, cột, index, FK, số record và orphan check |
| `music_user_db` | Identity | Đối chiếu Prisma schema, migration và code |
| `music_asset_db` | Asset | Đối chiếu Prisma schema, migration và code |
| `music_recommendation_db` | Recommendation | Đối chiếu Prisma schema, migration và code |
| `music_wallet_db` | Wallet | Đối chiếu Go migration và bootstrap schema |

Chỉ `music_song_db` đã được kiểm tra dữ liệu thật. Bốn database còn lại phải
chạy cùng audit live trước ngày reset; không được suy đoán record thật từ schema.

## 2. Nguyên tắc nền móng

1. Mỗi database có một service sở hữu; chỉ service đó ghi trực tiếp.
2. Không tạo foreign key xuyên database; dùng ID, API, event hoặc outbox.
3. Quan hệ chuẩn là source of truth; text trùng chỉ tồn tại khi có lý do rõ:
   snapshot, fallback dữ liệu cũ hoặc tối ưu đọc đã được đo.
4. Outbox, lease, retry, dead-letter có thể rỗng; rỗng không có nghĩa là dư.
5. Không drop trực tiếp: dừng ghi → migrate/backfill → deploy code mới → xác
   minh → drop ở migration/release sau.

## 3. Ownership mục tiêu

| Database | Chỉ nên chứa |
|---|---|
| `music_user_db` | user, login, OAuth, 2FA, token, security audit |
| `music_song_db` | catalog, song/audio, artist, album, playlist, lyrics, Library |
| `music_asset_db` | metadata asset, processing/cleanup job, asset usage |
| `music_recommendation_db` | snapshot gợi ý, interaction, lịch sử nghe, lease |
| `music_wallet_db` | ví, thanh toán, ledger, tỷ giá coin |

## 4. `music_song_db` — audit trực tiếp

### 4.1. Integrity

- Có **32 Prisma migrations** đã áp dụng.
- Không có orphan ở các quan hệ lõi đã kiểm tra:
  `song_artist_credits → songs/artists`, `album_tracks → songs/albums`,
  `album_artist_credits → artists`.
- Các quan hệ trên đều có foreign key, unique key và index phù hợp.

### 4.2. Số record thực tế

| Nhóm | Bảng | Record | Kết luận |
|---|---|---:|---|
| Catalog | `songs`, `artists`, `albums` | 1.135 / 74 / 720 | Giữ |
| Quan hệ catalog | `song_artist_credits`, `album_artist_credits`, `album_tracks` | 2.298 / 767 / 1.253 | Giữ; đây là source of truth |
| Catalog playlist | `playlists`, `playlist_tracks` | 21 / 518 | Giữ |
| User playlist | `user_playlists`, `user_playlist_tracks` | 6 / 79 | Giữ; khác catalog playlist |
| Library | `user_library_resources`, `favorites`, `song_owners` | 122 / 57 / 1.135 | Giữ |
| Publish | `catalog_drafts`, `artist_memberships` | 1.960 / 11 | Giữ |
| Lyrics | `song_lyrics`, `song_lyric_drafts`, `song_lyric_lines`, `song_lyric_words` | 17 / 1 / 1.023 / 1.069 | Giữ |
| System | `system_favorite_artworks` | 1 | Giữ |
| Job nền | `transcode_outbox`, `asset_cleanup_outbox`, `catalog_asset_usage_outbox` | 0 / 0 / 0 | Giữ; idle hợp lệ |
| Sai ownership | `coin_rates` | 1 | Phải chuyển khỏi Song DB |

### 4.3. Bảng không được gộp

- `playlists`/`playlist_tracks` khác `user_playlists`/`user_playlist_tracks`:
  catalog/editorial khác quyền sở hữu và lifecycle với dữ liệu người dùng.
- `song_lyrics` khác `song_lyric_drafts`: published khác draft/phân quyền.
- Ba outbox xử lý ba external side effect khác nhau: transcode, cleanup object,
  đồng bộ asset usage.

### 4.4. Lỗi ownership: `coin_rates`

`coin_rates` có trong `music_song_db`, nhưng code dùng bảng này thuộc Wallet
service và Wallet migration cũng tạo nó. Đây là bảng đặt nhầm database.

**Cách sửa an toàn:**

1. Xác nhận `music_wallet_db.coin_rates` tồn tại và có active rate đúng.
2. Kiểm tra `.env`, Docker/script bootstrap để Wallet không kết nối Song DB.
3. Nếu record development cần giữ, export sang Wallet DB.
4. Sau khi xác minh, thêm Song migration để drop `coin_rates`.

Không xóa tay bằng pgAdmin.

### 4.5. Cột legacy/denormalized trong `songs`

| Cột | Coverage thực tế | Vai trò | Quyết định |
|---|---:|---|---|
| `artistName` | 1.133/1.135 | fallback text | Giữ tạm; khi có credit thì không được ưu tiên nó |
| `albumName` | 1.133/1.135 | fallback text | Giữ tạm; album đúng lấy qua `album_tracks`/`sourceAlbumId` |
| `composerName` | 1.080/1.135 | legacy, trùng credit composer | Deprecate và lên kế hoạch xóa |
| `isrc` | 0/1.135 | mã chuẩn bản thu | Giữ nếu có roadmap import ISRC |
| `previewUrl` | 0/1.135 | preview ngắn | Quyết định theo product scope |

`composerName` là ứng viên xóa rõ nhất vì canonical data đã là
`song_artist_credits.role = 'composer'` và seed mới ghi rỗng. Trước khi xóa,
phải chuyển/review dữ liệu composer cũ hoặc chấp nhận bỏ cùng reset development.

### 4.6. Contract Catalog phải khóa lại

```text
Artist của bài      = song_artist_credits JOIN artists, role = 'artist'
Artist của album    = album_artist_credits JOIN artists
Track trong album   = album_tracks
Thứ tự hiển thị     = position
Nghệ sĩ chính       = isPrimary (được phép nhiều primary)
```

Không dùng artist của album để render artist của bài. `songs.artistName` chỉ là
fallback khi structured credits chưa tồn tại.

## 5. `music_recommendation_db` — lệch contract cần sửa trước production

Recommendation DB được phép lặp metadata vì nó là snapshot tối ưu đọc và không
được coi là Catalog authority. Tuy nhiên hiện có một lệch schema thật:

Catalog đã chuyển album từ `isSingle` sang:

```text
releaseType: 'album' | 'ep' | 'single'
```

Nhưng `RecommendationResourceSnapshot` và nhiều luồng Recommendation vẫn dùng
`isSingle`. Điều này làm Home/recommendation có thể phân loại sai EP.

**Migration bắt buộc:**

1. Thêm `releaseType VARCHAR(16) NOT NULL DEFAULT 'album'` vào snapshot.
2. Sửa DTO, mapper, generator và query Recommendation dùng `releaseType`.
3. Backfill từ Catalog hoặc reset toàn bộ snapshot development.
4. Test Album/EP/Single qua Catalog và Recommendation.
5. Đã triển khai: migration backfill rồi xóa `isSingle`; reader/writer mới
   chỉ dùng `releaseType` và vẫn hiểu payload Catalog cũ trong lúc rollout.

Các cặp sau cần lập bảng writer/reader trước khi quyết định xóa, không đoán:

- `name` và `title`
- `artistName` và `artistNames`
- `artworkBgColor` và `bgColor`
- `href`, `externalUrl`, `linkUrl`
- cột riêng với `attributes`, `relationships`, `raw` JSON

Một cột chỉ được xóa khi không còn code ghi, không còn code đọc và đã có field
canonical thay thế/backfill.

## 6. `music_asset_db` — giữ nguyên cấu trúc

| Bảng | Vai trò |
|---|---|
| `assets` | metadata canonical của asset |
| `asset_usages` | registry resource đang dùng asset |
| `asset_processing_jobs` | processing job có lease |
| `asset_processing_dead_letters` | audit lỗi xử lý |
| `asset_artifact_cleanup_jobs` | cleanup object storage có lease |

Không có bảng dư về kiến trúc. Asset service là chủ sở hữu duy nhất của object
storage lifecycle; Song/Catalog chỉ giữ asset ID và gửi usage intent.

## 7. `music_user_db` — giữ nguyên cấu trúc

Giữ `User`, password reset token, email verification token, recovery code 2FA,
OAuth account, security audit log và identity provisioning outbox. Các token
table có lifecycle/expiry/single-use khác nhau nên không gộp. Artist profile và
membership vẫn thuộc Catalog/Song, Identity chỉ sở hữu user identity.

## 8. `music_wallet_db` — chuẩn hóa nguồn DDL

Wallet chỉ dùng migration versioned tại
`apps/wallet/internal/database/migrations/000001_init.sql`. File bootstrap
trùng `apps/wallet/schema.sql` đã được xóa để không còn hai nguồn DDL.
Giữ bảng `wallets`, `bank_payment_orders`, `wallet_transactions`, `coin_rates`;
ledger không được xóa chọn lọc khi có tiền thật.

## 9. Checklist bắt buộc trước reset

### Schema

- [ ] `prisma migrate status` pass: Identity, Song, Asset, Recommendation.
- [ ] Fresh database: `prisma migrate deploy` pass từ database rỗng.
- [ ] Wallet versioned migrator tạo đúng schema trên Wallet DB rỗng.
- [ ] Mỗi service dùng đúng `DATABASE_URL` database nó sở hữu.
- [ ] Fresh Song DB không còn `coin_rates`.
- [x] Recommendation dùng `releaseType`; `isSingle` được backfill rồi xóa qua migration.

### Kết quả kiểm tra code (31/08/2026)

- [x] `apps/recommendation/prisma/schema.prisma` hợp lệ với Prisma.
- [x] `tools/scripts/dedupe-albums.mjs` pass `node --check` sau khi chuyển
  sang `releaseType`.
- [x] `git diff --check` không có whitespace error trên các file thay đổi.
- [ ] Type-check/lint toàn service chưa chạy được vì thư mục `node_modules`
  hiện thiếu package đã khai báo: `@grpc/grpc-js` và `tinyglobby`. Cần cài lại
  dependency lockfile trước khi xem kết quả này là green; không che lỗi bằng
  cách bỏ import hoặc bỏ rule.

### Contract/UI

- [ ] Có fixture: album solo, multi-primary album, EP, single, compilation.
- [ ] Có fixture: song solo, song multi-primary, song feat.
- [ ] Song row/detail/Library/playlist/artist page cùng dùng song credits.
- [ ] Header album chỉ dùng album credits.
- [ ] Artist link đi qua `projectLinkedArtists`/`artistRoute`.
- [ ] Không UI nào ưu tiên text fallback khi structured credits tồn tại.

### Job và storage

- [ ] Transcode, asset process và asset cleanup retry/lease pass sau restart.
- [ ] Reset development xóa object storage development tương ứng.
- [ ] Có backup; xác minh host/database/bucket trước mọi thao tác phá hủy.

## 9.1. Redis — audit live (31/08/2026)

Redis là hạ tầng transient/queue, không phải database catalog. Audit chỉ-đọc
ghi nhận:

| Chỉ số | Kết quả | Đánh giá |
|---|---:|---|
| Key có TTL | 188 (biến động theo thời điểm quét) | Đúng cho session, rate limit, lock và dedupe |
| Key không TTL | 7 | 5 stream queue/DLQ và 2 `metrics:queue`; hợp lệ về loại key |
| Stream | 5 stream / 333 event | Không có pending message trên consumer group |
| Key biến mất trong lúc quét | 0 | Không có dấu hiệu race bất thường |

Đã triển khai `StreamRetentionService` trong Song service:

- Main queue giữ 7 ngày mặc định và chỉ trim dưới ACK watermark của **mọi**
  consumer group; group ở `0-0` hoặc còn pending sẽ chặn trim an toàn.
- DLQ giữ 30 ngày mặc định; nếu có consumer group replay thì cũng bắt buộc qua
  ACK watermark trước khi trim.
- Một lượt chỉ trim tối đa 1.000 entry, chạy mỗi giờ; không có `MAXLEN` tại
  thời điểm publish nên không thể cắt message mới/pending.

Biến cấu hình: `REDIS_STREAM_MAIN_RETENTION_MS`,
`REDIS_STREAM_DLQ_RETENTION_MS`, `REDIS_STREAM_RETENTION_INTERVAL_MS`,
`REDIS_STREAM_TRIM_BATCH_SIZE`.

Script audit an toàn, không in URI, token, key đầy đủ hay document content:

```bash
node tools/scripts/audit-volatile-stores.mjs
```

## 9.2. MongoDB — ownership đúng, audit live đang bị chặn

| Database/collection | Owner | Identity canonical | Index bắt buộc |
|---|---|---|---|
| Identity Mongo / `user_metadata` | Identity | `userId` từ PostgreSQL | unique `userId` |
| Meta Mongo / `song_metadata` | Meta | `(song_id, variant)` | unique `(song_id, variant)` |

Audit live sau khi cài lại dependency cho kết quả:

| Collection | Document | Thiếu identity | Trùng identity | Kết luận |
|---|---:|---:|---:|---|
| `user_metadata` | 32 | `missingUserId: 0` | `duplicateUserIds: 0` | Sạch |
| `song_metadata` | 1.319 | `missingSongId: 0` | `duplicateSongVariants: 0` | Quan hệ/index sạch |

`song_metadata` còn **994 document legacy không có `variant`**. Repository hiện
chủ động đọc chúng như variant `mixed`, nên đây không phải lỗi playback, nhưng
chưa là schema sạch tuyệt đối. Với kế hoạch reset toàn bộ development data,
không cần chạy update/delete rủi ro: database mới phải chỉ nhận document có
`variant`. Giữ fallback đọc legacy đến khi reset/deploy mới ổn định rồi mới
xóa fallback ở release riêng.

Lưu ý vận hành: PostgreSQL Identity và Mongo Identity hiện có thể cùng dùng tên
`music_user_db` theo URI/config. Khác engine thì không xung đột kỹ thuật, nhưng
nên đổi tên Mongo rõ nghĩa hơn (ví dụ `music_identity_metadata_db`) trước
production để tránh reset nhầm database.

## 10. Audio Intelligence và Qdrant — checklist trước khi seed lại

Audio analysis không dùng lại `moodTags` hoặc kết quả mood analyzer cũ. Kết quả
CLAP duy nhất được ghi vào `audioAnalysis*`, `audioEmbedding`, `audioBpm`,
`audioEnergy` và `audioTags` của Song. `moodTags` chỉ còn là metadata biên tập
tùy chọn; database mới sẽ rỗng nếu seed không chủ động nhập nó.

- [ ] Dừng worker và các service ghi dữ liệu trước khi reset.
- [ ] Reset các PostgreSQL database development bằng migration từ database rỗng.
- [ ] Xóa collection Qdrant `song_audio_embeddings_v1`. Đây là index dẫn xuất,
  không phải catalog authority; không được giữ vector của database cũ.
- [ ] Chỉ khi worker đã dừng, xóa các Redis stream/consumer group development
  còn tồn từ lượt seed trước, gồm queue transcode, completion và
  `audio_intelligence_queue`. Nếu không, message cũ có thể bị xử lý sau reset.
- [ ] Chạy worker với `AUDIO_INTELLIGENCE_ENABLED=true`; xác minh URL và secret
  được worker báo là configured, rồi mới bắt đầu seed.
- [ ] Sau khi seed, không coi `Song READY` là hoàn tất audio AI. Chỉ chốt seed
  khi toàn bộ catalog song có `audioAnalysisStatus=READY` hoặc đã có danh sách
  `FAILED` được xử lý có chủ đích.
- [ ] Xác minh collection Qdrant có số point bằng số catalog song phân tích
  thành công. Recommendation tự đồng bộ index này; không cần seed vector riêng.

Quyết định chi phí: lỗi gọi Modal được lưu `FAILED` và không tự retry vô hạn,
để không phát sinh GPU cost âm thầm. Vì vậy phải xử lý rõ từng `FAILED` trước
khi coi lượt seed là hoàn tất.

## 11. Thứ tự triển khai

1. Sửa Recommendation `releaseType`.
2. Chuyển `coin_rates` sang Wallet ownership; drop bằng Song migration.
3. Chốt roadmap ISRC/preview URL.
4. Deprecate/backfill/drop `composerName` bằng migration riêng.
5. Chọn một nguồn DDL cho Wallet.
6. Chạy fresh-schema test toàn bộ service.
7. Review migration, backup development rồi mới reset.

## 12. Query chặn reset

```sql
-- Credit mồ côi phải bằng 0
SELECT count(*)
FROM song_artist_credits c
LEFT JOIN songs s ON s.id = c."songId"
WHERE s.id IS NULL;

-- Album track mồ côi phải bằng 0
SELECT count(*)
FROM album_tracks t
LEFT JOIN albums a ON a.id = t."albumId"
WHERE a.id IS NULL;

-- Sau migration ownership, Song DB không được còn bảng này
SELECT to_regclass('public.coin_rates');
```

Hai query đầu phải trả `0`. Query cuối chỉ được trả `NULL` sau khi Wallet DB đã
có `coin_rates` hợp lệ.

## 13. Không có quyền xóa từ báo cáo này

Tài liệu không tự cho phép drop bảng/cột/index/database/bucket. Mỗi thay đổi
phải là migration riêng, được review, test trên database rỗng và có backup.
