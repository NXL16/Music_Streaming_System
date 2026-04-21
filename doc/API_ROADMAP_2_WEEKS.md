# API Roadmap 2 Tuần (Risk-based + Product Delivery)

## 1) Mục tiêu
- Giữ tốc độ phát triển tính năng API mới nhưng không nhân bản lỗ hổng hiện có.
- Ưu tiên sửa các điểm bảo mật/high risk trước, sau đó mở rộng API phục vụ sản phẩm.
- Duy trì clean code và tránh regression hiệu năng bộ nhớ.

## 2) Hiện trạng nhanh
Các API đã có:
- Auth: signup/login/refresh/logout/logout-all
- Songs: list/detail/upload/get-key
- KMS test endpoint
- Cleanup admin endpoint

Khoảng trống sản phẩm hiện tại:
- Chưa có API profile người dùng (me/update profile).
- Chưa có API quản lý thư viện cá nhân (my songs, update metadata/visibility, delete).
- Chưa có Playlist API dù shared-types đã có interface IPlaylist.
- Chưa có API ghi nhận playback event để cập nhật metrics.
- Chưa có endpoint khám phá nội dung như trending/recommendation cơ bản.

## 3) Quyết định thứ tự làm
Pha A (2-3 ngày): Hardening bắt buộc trước khi mở rộng.
Pha B (7-8 ngày): Xây API mới theo giá trị sản phẩm cao nhất.
Pha C (2-3 ngày): Hoàn thiện test, tối ưu, và chuẩn hóa tài liệu.

## 4) Kế hoạch 2 tuần chi tiết

### Tuần 1

#### Ngày 1 - Security hotfix + ổn định nền
1. Khóa hoặc loại bỏ endpoint KMS test khỏi runtime production.
2. Escape regex cho search songs để giảm rủi ro regex DoS.
3. Bổ sung logging khi xóa temp file thất bại.
4. Bổ sung e2e test cho các thay đổi trên.

Kết quả mong đợi:
- Không còn endpoint trả key_hex/iv_hex công khai.
- Search không nhận regex raw từ user input.

#### Ngày 2 - User self-service APIs
1. Thêm GET /users/me
2. Thêm PATCH /users/me
3. DTO validation rõ ràng (displayName, bio, avatar)
4. Thêm unit/e2e test cho profile flow

Kết quả mong đợi:
- Web có thể hiển thị và cập nhật profile user đang đăng nhập.

#### Ngày 3 - Library management (My songs)
1. Thêm GET /songs/me
2. Thêm PATCH /songs/:id (owner only)
3. Thêm DELETE /songs/:id (soft delete hoặc hard delete theo policy)
4. Kiểm soát ownership và quyền truy cập chặt chẽ

Kết quả mong đợi:
- User quản lý thư viện cá nhân hoàn chỉnh.

#### Ngày 4 - Playlist foundation (Phase 1)
1. Tạo schema Playlist + index
2. Thêm POST /playlists
3. Thêm GET /playlists/me
4. Thêm GET /playlists/:id

Kết quả mong đợi:
- Có đối tượng playlist dùng được ở mức cơ bản.

#### Ngày 5 - Playlist operations (Phase 2)
1. Thêm PATCH /playlists/:id
2. Thêm DELETE /playlists/:id
3. Thêm POST /playlists/:id/songs
4. Thêm DELETE /playlists/:id/songs/:songId

Kết quả mong đợi:
- CRUD playlist hoàn chỉnh cho owner.

### Tuần 2

#### Ngày 6 - Playback metrics API
1. Thêm POST /songs/:id/play-events
2. Chỉ nhận event whitelist (play, skip, complete)
3. Chống spam bằng throttle + idempotency key nhẹ
4. Cập nhật song metrics theo batch/an toàn

Kết quả mong đợi:
- Bắt đầu có dữ liệu hành vi nghe thực tế cho dashboard/recommendation.

#### Ngày 7 - Discovery APIs
1. Thêm GET /songs/trending
2. Thêm GET /songs/recent
3. Tối ưu query/index theo use case

Kết quả mong đợi:
- Web có nguồn dữ liệu trang chủ tốt hơn list mặc định.

#### Ngày 8 - Admin moderation APIs (tối thiểu)
1. Thêm GET /admin/songs?status=processing|failed|ready
2. Thêm PATCH /admin/songs/:id/status
3. Bảo vệ bằng AdminGuard + audit log cơ bản

Kết quả mong đợi:
- Admin xử lý bài lỗi/chờ duyệt nhanh hơn.

#### Ngày 9 - Perf + memory pass
1. Kiểm tra đường nóng query songs và playlist.
2. Chuẩn hóa lean/select/projection để giảm memory allocation.
3. Review cache TTL và key design, tránh cache phình.

Kết quả mong đợi:
- Không có regression rõ rệt về response time và memory footprint.

#### Ngày 10 - Hardening + release readiness
1. Chạy full e2e + lint + smoke test web flow chính.
2. Cập nhật tài liệu endpoint và test flow.
3. Chốt checklist deploy + rollback.

Kết quả mong đợi:
- Sẵn sàng release increment với rủi ro kiểm soát được.

## 5) Danh sách endpoint đề xuất thêm

User:
- GET /users/me
- PATCH /users/me

Songs:
- GET /songs/me
- PATCH /songs/:id
- DELETE /songs/:id
- POST /songs/:id/play-events
- GET /songs/trending
- GET /songs/recent

Playlist:
- POST /playlists
- GET /playlists/me
- GET /playlists/:id
- PATCH /playlists/:id
- DELETE /playlists/:id
- POST /playlists/:id/songs
- DELETE /playlists/:id/songs/:songId

Admin:
- GET /admin/songs
- PATCH /admin/songs/:id/status

## 6) Nguyên tắc triển khai
- Mỗi endpoint mới phải có DTO validation, authz check, và test tối thiểu.
- Ưu tiên code đơn giản: hàm ngắn, logic rõ, tránh abstraction quá sớm.
- Mỗi PR nên nhỏ, tách theo 1 nhóm endpoint liên quan.
- Tránh thay đổi lớn đụng nhiều module trong cùng PR.

## 7) Definition of Done cho từng API
- Pass lint + test liên quan.
- Không tạo lỗ hổng auth/authz mới.
- Không tăng đáng kể bộ nhớ hoặc độ trễ ở đường nóng.
- Có tài liệu request/response và mã lỗi chính.

## 8) Kịch bản bắt đầu ngay hôm nay
1. Chốt phạm vi Ngày 1 (security hotfix).
2. Tạo branch theo batch: api/hardening-day1.
3. Làm xong hotfix thì chuyển qua users/me và songs/me trước.
