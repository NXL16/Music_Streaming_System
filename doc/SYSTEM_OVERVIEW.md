# Tổng Quan Hệ Thống

## Cấu Trúc Monorepo

- apps/api: HTTP API chính cho xác thực, bài hát và cấp quyền lấy stream key.
- apps/kms: Dịch vụ gRPC để sinh khóa và lấy khóa.
- apps/worker: Pipeline transcode bất đồng bộ và upload object storage.
- apps/web: Web player Next.js cho đăng nhập và phát nhạc HLS.
- packages/shared-types: Enum/interface/hằng số dùng chung giữa các dịch vụ.

## Các Dịch Vụ Runtime

### API (apps/api)

- Framework: NestJS.
- Giao thức: HTTP.
- Global API prefix lấy từ API_PREFIX.
- CORS origin lấy từ CORS_ORIGIN.
- Dùng MongoDB để lưu metadata user/bài hát.
- Dùng Redis cho throttling, cache và tích hợp queue.
- Giao tiếp với KMS qua gRPC để lấy khóa giải mã.

### KMS (apps/kms)

- Framework: NestJS Microservice.
- Giao thức: gRPC.
- Địa chỉ lắng nghe: 0.0.0.0:5000.
- Service contract: proto/key-management.proto.

### Worker (apps/worker)

- Framework: NestJS application context (không public HTTP endpoint).
- Queue: BullMQ consumer trên transcode-queue.
- Trách nhiệm:
  - Nhận job transcode.
  - Sinh khóa mã hóa qua KMS.
  - Chạy ffmpeg để xuất HLS.
  - Upload output và ảnh cover lên storage tương thích R2.

### Web (apps/web)

- Framework: Next.js 16.
- Dùng axios client để gọi API.
- API baseURL mặc định trong code hiện tại: http://localhost:9999/api/v1.
- Dùng hls.js để phát nhạc và Zustand để quản lý auth/player state.

## Luồng Xử Lý Mức Cao

1. Người dùng upload bài hát lên API.
2. API tạo metadata và đẩy job transcode vào BullMQ.
3. Worker nhận job, gọi KMS lấy khóa, chạy ffmpeg và upload tài nguyên HLS, sau đó phát sự kiện completed/failed của queue.
4. API (TranscodeListener) lắng nghe sự kiện từ queue và cập nhật trạng thái xử lý bài hát trong MongoDB.
5. Web gọi API để lấy danh sách bài hát và stream key.
6. API xác thực quyền truy cập và gọi KMS khi cần cấp khóa giải mã.

## Ghi Chú Về Phân Quyền

Với bài hát private (`isPublic = false`), kiểm tra quyền sở hữu dựa trên uploadedBy.
