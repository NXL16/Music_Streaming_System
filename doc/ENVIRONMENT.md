# Tài Liệu Biến Môi Trường

## API (apps/api)

API sẽ validate biến môi trường ngay lúc khởi động.
Nếu thiếu biến bắt buộc hoặc giá trị không hợp lệ, tiến trình bootstrap sẽ dừng.

### Biến Bắt Buộc

- MONGODB_URI
- API_HOST
- API_PORT
- API_PREFIX
- JWT_ACCESS_SECRET
- JWT_ACCESS_EXPIRES_IN
- JWT_REFRESH_SECRET
- JWT_REFRESH_EXPIRES_IN
- REDIS_HOST
- REDIS_PORT
- REDIS_PASSWORD

### Quy Tắc Validate

- API_PORT: số nguyên dương.
- REDIS_PORT: số nguyên dương.
- JWT_ACCESS_EXPIRES_IN: định dạng như 15m, 1h, 7d, 30s.
- JWT_REFRESH_EXPIRES_IN: cùng định dạng như trên.

### Biến Bổ Sung Thường Dùng Khi Runtime

- CORS_ORIGIN (origin dùng cho CORS ở API).

## Worker (apps/worker)

File mẫu biến môi trường của Worker nằm tại apps/worker/.env.example.

### Redis

- REDIS_HOST
- REDIS_PORT
- REDIS_PASSWORD

Giá trị khuyến nghị khi chạy Redis bằng Docker trên máy local:

- REDIS_HOST=localhost
- REDIS_PORT=6379
- REDIS_PASSWORD=<mat-khau-trung-voi-container-redis>

### R2 Storage

- R2_ENDPOINT
- R2_ACCESS_KEY_ID
- R2_SECRET_ACCESS_KEY
- R2_BUCKET_NAME
- R2_PUBLIC_URL

## Web (apps/web)

Axios client trong source hiện đang dùng base URL local hardcode:

- http://localhost:9999/api/v1

Nếu muốn cấu hình API URL theo môi trường, hãy chỉnh web/src/lib/api.ts để dùng NEXT_PUBLIC_API_URL.

## KMS (apps/kms)

KMS gRPC server lắng nghe tại:

- 0.0.0.0:5000

Đảm bảo API và Worker có thể kết nối đến gRPC endpoint này trong môi trường local/dev.

## Ghi Chú Về Cách Chạy Local Hiện Tại

`pnpm docker:up` sẽ tạo container Redis `my-redis` với `--requirepass` thông qua script PowerShell tại `tools/scripts/docker-up-redis.ps1`.

Script lấy `REDIS_PASSWORD` theo thứ tự ưu tiên:

- Biến môi trường `REDIS_PASSWORD` của terminal hiện tại.
- `apps/api/.env`.
- `apps/worker/.env`.

Nếu không có mật khẩu, script sẽ dừng với lỗi `REDIS_PASSWORD is required`.

Khi Redis đang chạy local bằng script này, cấu hình Redis ở API/Worker nên trỏ về localhost:6379 và dùng cùng mật khẩu:

```bash
pnpm docker:up
```
