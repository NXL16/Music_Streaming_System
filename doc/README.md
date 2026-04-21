# Tài Liệu Music Streaming System

Thư mục này chứa tài liệu kỹ thuật hiện tại của monorepo.

## Danh Mục Tài Liệu

- SYSTEM_OVERVIEW.md: Kiến trúc dịch vụ, luồng dữ liệu và trách nhiệm từng thành phần.
- QUICK_START.md: Hướng dẫn thiết lập môi trường local và lệnh chạy.
- ENVIRONMENT.md: Danh sách biến môi trường cho API và Worker.
- TEST_FLOW.md: Ma trận test case theo endpoint và lệnh chạy e2e.
- API_ROADMAP_2_WEEKS.md: Lộ trình 2 tuần mở rộng API theo thứ tự risk-based và product value.

## Phạm Vi

Bộ tài liệu này bám theo codebase hiện tại sau các thay đổi monorepo gần đây:

- apps/api: API Gateway viết bằng NestJS.
- apps/kms: KMS microservice dùng gRPC.
- apps/worker: Worker transcode (BullMQ consumer).
- apps/web: Frontend Next.js.
- packages/shared-types: Các contract và hằng số dùng chung.

## Quy Ước Cập Nhật

Khi hoàn thành một chức năng, hãy cập nhật tài liệu trong cùng pull request hoặc cùng đợt commit.
