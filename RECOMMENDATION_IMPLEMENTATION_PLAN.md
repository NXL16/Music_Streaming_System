# Hệ thống Recommendation: Luồng và kế hoạch triển khai

## Mục tiêu

Xây dựng Home cá nhân hóa, học từ toàn bộ hành vi trong app thay vì chỉ lịch sử nghe. Home phải nhanh và không gọi AI mỗi lần user mở trang.

## Luồng hiện tại

```text
Web Home -> API Gateway -> Recommendation service (gRPC) -> PostgreSQL
                                      -> Song service để đồng bộ catalog
```

Phần đã có: Home global/cá nhân lưu cache, lazy regeneration, lease chống tạo trùng, event `PLAY_START`/`PLAY_COMPLETE`/`SKIP`, taste profile theo artist/genre có time-decay, collaborative ranking, popularity/freshness/feedback/diversity và analytics impression/open/play/dismiss.

Hạn chế: Library, Favourite album, playlist, follow artist, search click, BPM và audio similarity chưa thành recommendation signal chuẩn.

## Luồng mục tiêu

### Khi upload bài hát

```text
Upload file nhạc gốc
  -> Asset/Song pipeline hiện có
  -> chạy song song:
       - Modal tách beat/vocal
       - Modal GPU chạy CLAP trên bản mix gốc
  -> tính BPM và energy từ mix gốc
  -> lưu BPM, energy, audio tags, audio embedding và phiên bản model
  -> index audio embedding vào Qdrant
```

CLAP chỉ chạy khi upload hoặc source thay đổi; không chạy khi mở Home.

### Khi user thao tác

```text
Thao tác thành công tại service sở hữu dữ liệu
  -> API Gateway ghi preference event idempotent
  -> Recommendation service lưu event
  -> Home cá nhân được đánh dấu stale
  -> lần refresh Home tiếp theo dùng taste mới
```

| Event                  |         Điểm ban đầu |
| ---------------------- | -------------------: |
| `LIBRARY_ADDED`        |                   +1 |
| `ALBUM_FAVOURITED`     |                   +5 |
| `SONG_FAVOURITED`      |                   +5 |
| `PLAYLIST_TRACK_ADDED` |                   +6 |
| `ARTIST_FOLLOWED`      | tăng artist affinity |
| `SEARCH_CLICKED`       |    tín hiệu ngắn hạn |
| `CONTENT_HIDDEN`       |     tín hiệu âm mạnh |

Event remove/unfavourite sẽ đảo đúng phần đóng góp của event trước đó. Trọng số là cấu hình tập trung và sẽ được tinh chỉnh theo analytics.

### Library và Favourite album

```text
Add album to Library
  -> lưu album + các bài vào Library
  -> LIBRARY_ADDED (+1)

Favourite album
  -> đảm bảo album + bài đã có trong Library
  -> tạo AlbumFavorite riêng, hiện ngôi sao
  -> ALBUM_FAVOURITED (+5)

Unfavourite album
  -> chỉ xóa AlbumFavorite và hủy +5
  -> giữ album + bài trong Library
```

Ngôi sao không được suy ra từ trạng thái Library.

### Khi mở Home

```text
Mở Home -> lấy bản cache -> nếu stale thì regenerate background
         -> lấy candidate -> lọc/xếp hạng -> lưu Home mới
```

Candidate gồm: artist/genre/mood/BPM affinity, nội dung Library/Favourite tương tự, audio-vector neighbours từ Qdrant, collaborative candidates, phát hành mới, trending phù hợp và discovery.

## Checklist triển khai

### Phase 1 — Preference event foundation

- [x] Audit Recommendation, Song, API và Home.
- [x] Thêm `UserPreferenceEvent` schema/migration.
- [x] Thêm gRPC `RecordPreferenceEvent` và persistence idempotent.
- [x] Generate proto/Prisma; type-check Recommendation và API pass.
- [x] Ghi event cho Library, Favourite, playlist và các action khác; mutation thuộc Song dùng transactional outbox, lease/retry/dead-letter và `eventId` idempotent.
- [x] Dùng preference event trong `getUserTasteProfile` và invalidate Home.
- [x] Unit test event trùng/event đảo/profile scoring.

### Phase 2 — Favourite album

- [x] Thêm bảng `AlbumFavorite` và gRPC/API Song service.
- [x] API lấy trạng thái favourite để detail page/card hiển thị sao.
- [x] Favourite tự bảo đảm Library membership; Unfavourite không xóa Library.
- [x] Nối UI/menu và đồng bộ trạng thái card/detail trong phiên hiện tại.
- [x] Gửi event `ALBUM_FAVOURITED` / `ALBUM_UNFAVOURITED` sau khi DB lưu thành công, không double-count khi retry.

### Phase 3 — Product signals

- [x] Nối `Add to Library` (+1), chỉ ghi event khi tạo Library membership mới; retry không double-count.
- [x] Nối `Remove from Library` (-1), chỉ ghi event khi membership đã tồn tại và bị xóa thật.
- [x] Nối Song Favourite/Undo Favourite (+5/-5), chỉ ghi theo state transition.
- [x] Nối Favourite playlist/Undo Favourite (+5/-5), chỉ ghi theo state transition và tự gỡ Suggest Less ở server.
- [x] Nối thêm bài trực tiếp hoặc từ một nguồn vào playlist (+6); chỉ ghi cho bài được thêm mới.
- [x] Nối bỏ bài khỏi playlist (-6); chỉ ghi khi bản ghi track thực sự bị xóa.
- [x] Nối click mở kết quả tìm kiếm (+2), gửi bất đồng bộ để không chặn điều hướng.
- [x] Nối Follow Artist (+5/-5): trạng thái bền vững, UI optimistic và chỉ ghi event khi trạng thái đổi thật.
- [x] Nối Play Next / Play Last (+2): chỉ ghi sau khi queue cục bộ đã thêm thành công; lỗi telemetry không ảnh hưởng playback.
- [x] Nối Hide / Undo Suggest Less: lưu trạng thái server-side, đồng bộ giữa thiết bị và loại nội dung đã ẩn trước khi publish Home cá nhân.
- [x] Outbox/retry cho cross-service delivery: transactional preference outbox, idempotent event ID, lease, exponential retry và dead-letter.

### Phase 3.5 — Chuẩn hóa tín hiệu nghe

- [x] Client chỉ cộng các đoạn audio chạy thực sự, không dùng vị trí timeline làm thời lượng nghe.
- [x] Chốt phiên khi đóng/reload bằng `PLAY_STOPPED` trung tính; mọi listening event gửi lỗi đều vào local outbox và gửi lại khi có phiên đăng nhập kế tiếp; pause/replay trong cùng trang giữ bộ đếm hiện tại.
- [x] Ghi nhận early skip khi đổi bài trước 3 giây; pause/đóng tab và replay có giới hạn vẫn thuộc state machine còn lại.
- [x] Không tính nghe hết khi người dùng tua thẳng đến các giây cuối bài.
- [x] Gom trọng số hành vi vào một policy dùng chung; version hoá khi bắt đầu A/B test hoặc thay đổi trọng số production.
- [x] Quy định và test các mức nghe: ngắn (<30%), trung bình (>=30%), engaged (>=70%), gần hết (>=90%/tự kết thúc); replay bị giới hạn hiệu lực.

### Phase 4 — Audio intelligence

- [x] Chọn `laion/larger_clap_general` (Apache-2.0); khi triển khai phải pin revision/hash của checkpoint.
- [x] Modal GPU worker tùy chọn chạy cùng pipeline upload; source mới chuyển analysis về `PENDING`.
- [x] CLAP phân tích mix gốc, lưu BPM/energy/tags/version/embedding.
- [x] Có analysis version, trạng thái `PENDING`/`READY`/`FAILED`, error và log observability.
- [ ] Backfill/retry có kiểm soát chi phí cho các bài `FAILED`.

### Phase 5 — Vector retrieval và ranking

- [x] Qdrant với REST adapter có thể thay thế; Qdrant chỉ là derived index.
- [x] Index audio embedding 512D cùng metadata filter và đồng bộ incremental từ Song.
- [x] Vector candidate generation được trộn vào ranking Home hiện có, không tạo shelf mới.

### Phase 6 — ML nâng cao

- [ ] Two-Tower khi có đủ hành vi user thật.
- [ ] Deep reranker khi evaluation chứng minh hiệu quả.
- [x] Không dùng LLM mỗi lần mở Home.

## File đã thêm/sửa

- `apps/recommendation/prisma/schema.prisma`
- `apps/recommendation/prisma/migrations/20260904174000_add_user_preference_events/migration.sql`
- `apps/recommendation/src/preferences/preference.service.ts`
- `apps/recommendation/src/preferences/preferences.module.ts`
- `packages/shared-proto/recommendation_service.proto`
- API/Recommendation wiring cho `RecordPreferenceEvent`
- `apps/song/prisma/migrations/20260904180500_add_album_favorites/migration.sql`
- `apps/web/lib/favorites/album-favorite.api.ts`
- `apps/web/lib/favorites/use-album-favorite-store.ts`

## Ràng buộc

- Giữ nguyên các thay đổi không liên quan trong workspace.
- Không gọi AI khi mở Home; Modal chỉ chạy lúc phân tích upload.
- Model open-source vẫn phải kiểm tra license trước khi deploy thương mại.
- Qdrant là vector database, không tự quyết định recommendation.
