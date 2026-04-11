# 🎧 Hệ Thống Phát Nhạc Trực Tuyến - Kiến Trúc Hệ Thống (v2.0)

**Phiên bản:** 2.0.0  
**Cập nhật lần cuối:** 2026-04-10  
**Loại:** Kiến Trúc Hệ Thống HLS + Mã Hóa AES-128  
**Công Nghệ:** PNPM Monorepo + NestJS + Next.js + gRPC + Cloudflare

---

## 📑 Mục Lục

1. [Yêu Cầu & Định Nghĩa](#1-yêu-cầu--định-nghĩa)
2. [Tổng Quan Kiến Trúc](#2-tổng-quan-kiến-trúc)
3. [Cấu Trúc Monorepo & Hướng Dẫn Phát Triển](#3-cấu-trúc-monorepo--hướng-dẫn-phát-triển)
4. [Các Thành Phần Chính (Tech Stack)](#4-các-thành-phần-chính-tech-stack)
5. [Bảo Vệ Nội Dung](#5-bảo-vệ-nội-dung-multi-layer-security)
6. [Luồng Xử Lý Dữ Liệu](#6-luồng-xử-lý-dữ-liệu)

---

## 1. 📋 Yêu Cầu & Định Nghĩa

### 1.1. Yêu Cầu Chức Năng (Functional Requirements)

#### 👤 **Người Dùng Thường**

**Xác Thực:**

- Đăng ký → xác nhận email → đăng nhập
- JWT token (24 giờ TTL) + Refresh token (7 ngày)
- Dấu vân tay thiết bị: Tạo ID duy nhất cho mỗi device
- Quản lý phiên: Xóa phiên cũ khi đăng xuất

**Khám Phá & Tìm Kiếm:**

- Duyệt danh sách bài hát (phân trang, 20 bài/trang)
- Tìm kiếm toàn văn: Tên bài, Nghệ sĩ, Album
- Lọc & Sắp xếp.

**Phát Nhạc (HLS Streaming):**

- Thời gian khởi động: < 1.5 giây.
- Tự Thích Nghi Chất Lượng (ABR): 320kbps, 192kbps, 128kbps.
- Tua nhạc mượt mà.

**Quản Lý Danh Sách Phát:**

- Tạo playlist, thêm/xóa bài, chia sẻ.

#### 🛠️ **Quản Trị Viên (Admin)**

- Upload nhạc (MP3, FLAC, WAV). Hệ thống tự động transcode HLS, mã hóa AES-128, tạo thumbnail (WebP + BlurHash), upload lên R2.
- Thống kê, giám sát hệ thống.

---

## 2. 🧠 Tổng Quan Kiến Trúc

### Sơ Đồ Toàn Cảnh (High-Level Diagram)

```text
┌────────────────────────────────────────────────────────────────────┐
│                       TẦNG NGƯỜI DÙNG (Client)                     │
│  ┌──────────────────┐  ┌──────────────────┐  ┌─────────────────┐   │
│  │  Next.js Web App │  │  Trình Duyệt Di  │  │  Ứng Dụng Native│   │
│  │  ├─ Hls.js       │  │  Động            │  │  (React Native) │   │
│  │  ├─ Device FP    │  │  (iOS/Android)   │  │  ├─ Crypto API  │   │
│  │  └─ JWT Manager  │  │  ├─ Web Audio    │  │  └─ Local Auth  │   │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬────────┘   │
│           └─────────────────────┼─────────────────────┘            │
│                     JWT + Device Fingerprint                       │
└───────────────────────────────────┬────────────────────────────────┘
                                    │
        ┌───────────────────────────┴───────────────────────────┐
        │                                                       │
        ▼                                                       ▼
┌──────────────────────────────────┐            ┌──────────────────────┐
│ CLOUDFLARE WORKERS (Edge)        │            │    CỔNG API          │
│  ├─ Xác Minh Signed Cookies      │            │ (NestJS - apps/api)  │
│  ├─ Giới Hạn Tốc Độ              │            │                      │
│  ├─ Phát Hiện Bot                │            │ Trách Vụ:            │
│  ├─ Proxy đến R2/API             │            │ ├─ Xác Thực          │
└──────────────┬───────────────────┘            │ ├─ Logic Streaming   │
               │                                └───────────┬──────────┘
               ▼                                            │
    ┌──────────────────┐                      ┌─────────────┴───────┐
    │    R2 Storage    │                      ▼                     ▼
    │ (Cloudflare)     │             ┌────────────────┐    ┌──────────────────┐
    │ ├─ .m3u8 files   │             │  KMS Service   │    │ Redis Cache      │
    │ ├─ .ts segments  │             │ (apps/kms)     │    │ ├─ Metadata      │
    │ ├─ Thumbnails    │             │ ├─ gRPC Server │    │ ├─ Phiên         │
    └────────┬─────────┘             └────────┬───────┘    └────────┬─────────┘
             ▲                                ▲                     ▲
             └─────────────────┬──────────────┼─────────────────────┘
                               ▼              ▼
                       ┌───────────────┐ ┌──────────────┐
                       │    WORKERS    │ │   DATABASES  │
                       │ (Transcoding) │ │ ├─ MongoDB   │
                       │ ├─ FFmpeg     │ │ ├─ MySQL     │
                       └───────────────┘ └──────────────┘
```

---

## 3. 🏗️ Cấu Trúc Monorepo & Hướng Dẫn Phát Triển

Hệ thống sử dụng Turborepo và PNPM Workspaces để quản lý.

### 3.1. Cấu Trúc Thư Mục Cốt Lõi

```text
01-musical/
├── pnpm-workspace.yaml        # Khai báo ranh giới các package
├── turbo.json                 # Cấu hình luồng build/dev của Turborepo
├── package.json               # Các script chạy toàn cục ở Root
│
├── packages/                  # 📦 CÁC GÓI NỘI BỘ (Chỉ dùng trong Workspace)
│   ├── ts-config/             # Nguồn chân lý cho cấu hình TypeScript (@musical/ts-config)
│   └── shared-types/          # Chứa Interfaces, DTOs dùng chung (@musical/shared-types)
│
├── apps/                      # 🎯 CÁC ỨNG DỤNG CHÍNH
│   ├── api/                   # Backend NestJS (API Gateway, Core Logic)
│   ├── web/                   # Frontend Next.js (UI, HLS Player)
│   └── kms/                   # Key Management Service (gRPC)
│
└── tools/                     # 🔧 CÔNG CỤ & BACKGROUND SERVICES
    └── transcoding-worker/    # FFmpeg Worker (NestJS Standalone)
```

### 3.2. Quy Chuẩn Chia Sẻ Dữ Liệu (Data Flow)

- Gói `@musical/shared-types` chứa các Interface gốc (ví dụ `ISong`, `IUser`).
- **Backend (`apps/api`)**: Cấu hình `package.json` import `"@musical/shared-types": "workspace:*"`. NestJS sẽ resolve symlink.
- **Frontend (`apps/web`)**: Trong `next.config.ts`, bắt buộc cấu hình `transpilePackages: ["@musical/shared-types"]` để Next.js biên dịch gói nội bộ.

Điều này đảm bảo khi thay đổi type ở `shared-types`, cả Web và API đều được Hot-Reload và báo lỗi nếu có sai sót kiểu dữ liệu.

---

## 4. Các Thành Phần Chính (Tech Stack)

- **Frontend (`apps/web`)**: Next.js 14, React 18, TypeScript, TailwindCSS, Zustand, Hls.js.
- **API Gateway (`apps/api`)**: NestJS 10, MongoDB + Mongoose, Redis, BullMQ, Passport + JWT.
- **KMS Microservice (`apps/kms`)**: NestJS, gRPC, MySQL + TypeORM, Node Crypto (AES-128).
- **Transcoding Worker (`tools/transcoding-worker`)**: NestJS, FFmpeg, BullMQ, Sharp (Image processing).

---

## 5. 🔐 Bảo Vệ Nội Dung (Multi-Layer Security)

1. **Lớp 0 (Edge - Cloudflare)**: Phát hiện bot, DDoS shield, Rate limiting.
2. **Lớp 1 (Thiết bị)**: Tạo Device Fingerprint, kiểm tra IP/Browser, khóa tài khoản nếu chia sẻ bừa bãi.
3. **Lớp 2 (URL - Ký số)**: File `.m3u8` và `.ts` được bảo vệ bằng Signed Cookies (TTL 30 phút).
4. **Lớp 3 (Mã hóa nội dung - AES-128)**: Các file `.ts` bị mã hóa. Khóa chỉ cấp phát (Just-In-Time) qua API `/stream/key` dựa vào JWT + Device FP, khóa giải mã trực tiếp trong RAM của trình duyệt qua Web Crypto API.

---

## 6. 🔄 Luồng Xử Lý Dữ Liệu

### 6.1. Upload & Xử Lý

1. Admin Upload (POST `/api/v1/admin/upload`).
2. API lưu tạm, tạo BullMQ Job.
3. Transcoding Worker nhận Job, xin khóa mã hóa từ KMS.
4. Worker dùng FFmpeg chia MP3 thành các file HLS `.ts` (mã hóa AES-128 cho từng bitrate 128k/192k/320k) và sinh manifest `.m3u8`.
5. Worker tạo Thumbnail & BlurHash, upload lên R2.
6. Worker cập nhật status `ready` vào MongoDB.

### 6.2. Phát Nhạc

1. User bấm Play -> Client tạo Device FP, lấy JWT.
2. Yêu cầu Manifest -> API kiểm tra hợp lệ, tạo Signed Cookie, trả về `.m3u8`.
3. `Hls.js` parse manifest, phát hiện cần Khóa.
4. Yêu cầu Khóa -> KMS kiểm tra JWT + Device FP, trả về Khóa (16 bytes).
5. `Hls.js` tải `.ts` (kèm Signed Cookie), dùng Khóa giải mã trong RAM, đưa vào Web Audio API phát nhạc.
