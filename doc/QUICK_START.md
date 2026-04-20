# Bắt Đầu Nhanh (Môi Trường Local)

## 1) Điều Kiện Tiên Quyết

- Node.js 20+.
- pnpm (workspace đang dùng pnpm@10).
- Docker (khuyến nghị cho hạ tầng local).
- ffmpeg khả dụng (worker dùng ffmpeg installer package).

## 2) Cài Đặt Dependencies

Tại thư mục gốc repo:

```bash
pnpm install
```

## 3) Khởi Động Hạ Tầng Local

Tại thư mục gốc repo:

```bash
pnpm docker:up
```

Lệnh `docker:up` hiện tại sẽ chạy script `tools/scripts/docker-up-redis.ps1` để khởi tạo container Redis `my-redis` với cấu hình `--requirepass`.

Lưu ý:

- `REDIS_PASSWORD` là bắt buộc.
- Script ưu tiên lấy mật khẩu theo thứ tự:
	- Biến môi trường `REDIS_PASSWORD` của terminal hiện tại.
	- `apps/api/.env`.
	- `apps/worker/.env`.
- Nếu không tìm thấy `REDIS_PASSWORD`, lệnh sẽ dừng với lỗi `REDIS_PASSWORD is required`.

Ví dụ thiết lập nhanh trong terminal bash:

```bash
export REDIS_PASSWORD='LocalRedis@2026'
pnpm docker:up
```

Kiểm tra Redis container:

```bash
docker ps --filter "name=my-redis" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
```

## 4) Cấu Hình File Môi Trường

Tạo file môi trường cho từng app khi cần (API, KMS, Web, Worker).

Lưu ý:

- API dùng cơ chế validate env nghiêm ngặt và fail-fast khi thiếu biến bắt buộc.
- Worker có file mẫu tại apps/worker/.env.example.
- Nếu dùng Redis container như trên, đặt `REDIS_HOST=localhost`, `REDIS_PORT=6379` và `REDIS_PASSWORD` cùng giá trị cho API/Worker.

## 5) Chạy Dịch Vụ

Thứ tự khởi động khuyến nghị:

```bash
pnpm dev:kms
pnpm dev:api
pnpm dev:worker
pnpm dev:web
```

Hoặc chạy tất cả song song:

```bash
pnpm dev
```

## 6) Kiểm Tra Chất Lượng

Tại thư mục gốc repo:

```bash
pnpm -w lint
pnpm -w type-check
pnpm -w build
```

Ví dụ chạy API e2e:

```bash
pnpm --filter api exec jest --config test/jest-e2e.json --detectOpenHandles --runInBand
```

## 7) Tắt Hạ Tầng Local

```bash
pnpm docker:down
```

Xem log Redis container:

```bash
pnpm docker:logs
```
