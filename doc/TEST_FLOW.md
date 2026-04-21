# Test Flow API (Toàn Bộ Endpoint Hiện Có)

## Mục Tiêu

Tài liệu này mô tả:

- Toàn bộ endpoint HTTP hiện có trong `apps/api`.
- Các trường hợp đã test cho từng endpoint.
- Lệnh chạy test đúng theo ngữ cảnh thư mục.

## Phạm Vi Hiện Tại

Đã cover tất cả endpoint hiện có:

- Root: `GET /`
- Auth: `POST /auth/signup`, `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`, `POST /auth/logout-all`
- Songs: `GET /songs`, `GET /songs/:id`, `GET /songs/:id/key`
- Songs Upload: `POST /songs/upload`
- KMS: `GET /kms/test-generate/:songId`
- Cleanup: `POST /cleanup/temp-files`, `POST /cleanup/failed-processing`, `POST /cleanup/all`

File test e2e hiện có:

- `apps/api/test/app-root.e2e-spec.ts`
- `apps/api/test/auth.e2e-spec.ts`
- `apps/api/test/songs.e2e-spec.ts`
- `apps/api/test/songs-upload.e2e-spec.ts`
- `apps/api/test/kms.e2e-spec.ts`
- `apps/api/test/cleanup.e2e-spec.ts`

## Ma Trận Test Case

### Root

1. `GET /` trả về hello message.
2. `GET /` trả về custom message từ service.

### Auth

1. `POST /auth/signup` thành công.
- Input hợp lệ.
- Kỳ vọng `AUTH_SIGNUP_SUCCESS`.
- Xác nhận normalize `username`/`email`.

2. `POST /auth/signup` fail validation.
- Mật khẩu yếu.
- Kỳ vọng HTTP 400.

3. `POST /auth/signup` conflict.
- Giả lập trùng `username`.
- Kỳ vọng HTTP 409 và `AUTH_USERNAME_EXISTS`.

4. `POST /auth/login` thành công.
- Kỳ vọng `AUTH_LOGIN_SUCCESS`.

5. `POST /auth/login` fail sai thông tin đăng nhập.
- Kỳ vọng HTTP 401 và `AUTH_INVALID_CREDENTIALS`.

6. `POST /auth/refresh` fail khi thiếu `refreshToken`.
- Kỳ vọng HTTP 400 và `AUTH_REFRESH_TOKEN_REQUIRED`.

7. `POST /auth/refresh` thành công.
- Kỳ vọng HTTP 200 và `AUTH_REFRESH_SUCCESS`.

8. `POST /auth/refresh` fail token không hợp lệ.
- Kỳ vọng HTTP 401 và `AUTH_TOKEN_INVALID`.

9. `POST /auth/logout` thành công.
- Xác nhận service nhận đúng `userId` + `deviceId` từ guard.

10. `POST /auth/logout-all` thành công.
- Xác nhận service nhận đúng `userId`.

### Songs

1. `GET /songs` trả danh sách thành công.
- Kỳ vọng `SONGS_LIST_SUCCESS`.

2. `GET /songs` fail query validation.
- `cursor` sai format.
- Kỳ vọng HTTP 400.

3. `GET /songs/:id` thành công khi có quyền.
- Kỳ vọng `SONG_DETAILS_SUCCESS`.

4. `GET /songs/:id` fail khi không có quyền.
- Kỳ vọng HTTP 403.

5. `GET /songs/:id` fail khi không tồn tại.
- Kỳ vọng HTTP 404 và `SONG_NOT_FOUND`.

6. `GET /songs/:id/key` thành công, trả binary.
- Kỳ vọng header `application/octet-stream`.

7. `GET /songs/:id/key` fallback fingerprint.
- Khi thiếu `User-Agent`, truyền `unknown-device` vào service.

8. `GET /songs/:id/key` fail forbidden.
- Kỳ vọng HTTP 403.

9. `GET /songs/:id/key` fail bad request (song chưa sẵn sàng).
- Kỳ vọng HTTP 400.

### Songs Upload

1. `POST /songs/upload` fail khi thiếu file.
- Kỳ vọng HTTP 400 và `NO_FILE`.

2. `POST /songs/upload` fail sai mime type.
- Upload `text/plain`.
- Kỳ vọng HTTP 400 và `INVALID_FILE_TYPE`.

3. `POST /songs/upload` fail sai audio signature.
- Mime type hợp lệ nhưng nội dung không phải audio thật.
- Kỳ vọng HTTP 400 và `INVALID_FILE_CONTENT`.

4. `POST /songs/upload` success processing.
- Header mp3 hợp lệ.
- Kỳ vọng HTTP 201 và `SONG_PROCESSING`.
- Xác nhận map `isPublic` đúng.

5. `POST /songs/upload` duplicate.
- Service trả `isDuplicate = true`.
- Kỳ vọng HTTP 409 và `SONG_DUPLICATE`.

6. `POST /songs/upload` unknown internal error.
- Service ném lỗi không xác định.
- Kỳ vọng HTTP 500 và `SONG_UPLOAD_FAILED`.

### KMS

1. `GET /kms/test-generate/:songId` thành công.
- Kiểm tra map `key`/`iv` sang hex string.
- Yêu cầu `JwtAuthGuard` + `AdminGuard`.

2. `GET /kms/test-generate/:songId` fail từ service.
- Kỳ vọng HTTP 400.

3. `GET /kms/test-generate/:songId` bị vô hiệu hóa ở production.
- Kỳ vọng HTTP 404 và `KMS_TEST_ENDPOINT_DISABLED`.

### Cleanup

1. `POST /cleanup/temp-files` thành công.
2. `POST /cleanup/failed-processing` thành công.
3. `POST /cleanup/all` thành công và gọi cả 2 task.
4. `POST /cleanup/failed-processing` fail khi service lỗi.
- Kỳ vọng HTTP 500.

## Lệnh Chạy Test

### Chạy toàn bộ e2e của API (từ root repo)

```bash
pnpm --filter api test:e2e
```

### Chạy từng file e2e (từ root repo)

```bash
pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand app-root.e2e-spec.ts
pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand auth.e2e-spec.ts
pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand songs.e2e-spec.ts
pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand songs-upload.e2e-spec.ts
pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand kms.e2e-spec.ts
pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand cleanup.e2e-spec.ts
```

### Chạy từng file e2e bằng testPathPatterns (từ root repo)

```bash
pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand --testPathPatterns=auth.e2e-spec.ts
pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand --testPathPatterns=songs.e2e-spec.ts
pnpm --filter api exec jest --config ./test/jest-e2e.json --runInBand --testPathPatterns=songs-upload.e2e-spec.ts
```

## Trạng Thái Hiện Tại

- 6 suites / 34 tests: PASS.
- Lint test files: PASS.

## Lưu Ý Quan Trọng

- Nếu chạy `jest` không chỉ định `--config ./test/jest-e2e.json`, Jest có thể dùng config mặc định với `rootDir=src` và dẫn đến lỗi `No tests found`.
- Với config `test/jest-e2e.json`, `rootDir` trỏ vào `apps/api/test`, nên dùng pattern file ngắn gọn như `songs.e2e-spec.ts`.
- Bộ test hiện tại là e2e controller-level với service mock để bảo đảm tốc độ và ổn định. Các integration test với DB/Redis/BullMQ sẽ được bổ sung riêng.

## Mở Rộng Khuyến Nghị (Bước Tiếp Theo)

1. Bổ sung integration test service layer (Mongo/Redis/BullMQ) cho đường đi runtime thật.
2. Bổ sung test rate-limit thực tế (không override `ThrottlerGuard`) cho endpoint nhạy cảm.
3. Khi chuyển qua FE, tạo smoke test theo user journey: signup -> login -> upload -> play.
