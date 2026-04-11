# 🏗️ Kiến Trúc Monorepo & Hướng Dẫn Phát Triển

**Dự án:** 01-musical  
**Cập nhật lần cuối:** 2026-04-10  
**Stack Công Nghệ:** Turborepo, PNPM Workspaces, Next.js 16 (Turbopack), NestJS 11.

Tài liệu này quy định cấu trúc thư mục, cách cấu hình các gói nội bộ (Internal Packages) và luồng chia sẻ dữ liệu (Data Flow) xuyên suốt toàn bộ hệ thống. Mục tiêu là đảm bảo tính đồng nhất, an toàn kiểu (Type-safe) và tối ưu hiệu suất build.

---

## 1. 📂 Cấu Trúc Thư Mục Cốt Lõi

Dự án áp dụng mô hình chia tách rõ ràng giữa ứng dụng (Apps) và thư viện dùng chung (Packages).

```text
01-musical/
├── pnpm-workspace.yaml        # Khai báo ranh giới các package (apps/*, packages/*)
├── turbo.json                 # Cấu hình luồng build/dev và cache của Turborepo
├── package.json               # Các script chạy toàn cục ở Root
│
├── packages/                  # 📦 CÁC GÓI NỘI BỘ (Chỉ dùng trong Workspace)
│   ├── ts-config/             # Nguồn chân lý cho cấu hình TypeScript
│   │   ├── package.json       # name: "@musical/ts-config"
│   │   └── base.json          # Rule chuẩn cho toàn bộ dự án
│   │
│   └── shared-types/          # Chứa Interfaces, DTOs, Enums dùng chung
│       ├── package.json       # name: "@musical/shared-types"
│       └── src/
│           └── index.ts       # Nơi export mọi type (Không cần tsconfig ở đây)
│
└── apps/                      # 🎯 CÁC ỨNG DỤNG CHÍNH
    ├── api/                   # Backend NestJS (API Gateway, Core Logic)
    │   ├── package.json       # devDependencies chứa @musical/ts-config
    │   ├── tsconfig.json      # Kế thừa từ ../../packages/ts-config/base.json
    │   └── src/
    │
    └── web/                   # Frontend Next.js (UI, HLS Player)
        ├── package.json       # devDependencies chứa @musical/ts-config
        ├── tsconfig.json      # Kế thừa từ ../../packages/ts-config/base.json
        ├── next.config.ts     # Bắt buộc có transpilePackages
        └── src/
```

---

## 2. ⚙️ Quy Chuẩn Cấu Hình Các Gói (Packages)

Để hệ thống nhẹ và không bị vòng lặp phụ thuộc, dự án áp dụng mô hình **Internal Packages**. Các gói dùng chung không tự build, mà nhường việc biên dịch lại cho các ứng dụng tiêu thụ (Apps).

### 2.1. Gói Cấu Hình: `@musical/ts-config`

Cung cấp bộ quy tắc TypeScript chuẩn mực. Tuyệt đối **không** code logic ở đây.

- Kế thừa ở các App thông qua đường dẫn vật lý: `"extends": "../../packages/ts-config/base.json"`

### 2.2. Nguồn Chân Lý: `@musical/shared-types`

Nơi định nghĩa các hợp đồng giao tiếp (API Contracts, Database Models) giữa Backend và Frontend.

- Gói này **chỉ chứa file `.ts` gốc**, không cần `tsconfig.json` hay lệnh build riêng.

**`packages/shared-types/package.json`**:

```json
{
  "name": "@musical/shared-types",
  "version": "1.0.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

---

## 3. 🚀 Quy Chuẩn Cấu Hình Ứng Dụng (Apps)

Để các App (Next.js, NestJS) có thể đọc và hiểu được Type từ package nội bộ, bắt buộc tuân thủ 2 nguyên tắc sau:

### 3.1. Đối với Backend (NestJS - `apps/api`)

- **package.json:** Phải khai báo `"@musical/shared-types": "workspace:*"` trong `dependencies` và `"@musical/ts-config": "workspace:*"` trong `devDependencies`.
- **tsconfig.json:** Kế thừa `base.json` và bổ sung các rules đặc thù cho Decorator:
  ```json
  "emitDecoratorMetadata": true,
  "experimentalDecorators": true
  ```
- _NestJS (thông qua `ts-loader`) sẽ tự động phân tích (resolve) đường dẫn symlink để lấy file từ `shared-types`._

### 3.2. Đối với Frontend (Next.js - `apps/web`)

- **package.json:** Khai báo tương tự như Backend.
- **next.config.ts:** Đây là yếu tố then chốt. Vì Next.js mặc định bỏ qua biên dịch code trong `node_modules`, ta phải ép Next.js biên dịch gói nội bộ bằng lệnh sau:
  ```typescript
  const nextConfig: NextConfig = {
    transpilePackages: ["@musical/shared-types"],
  };
  export default nextConfig;
  ```

---

## 4. 🔄 Luồng Phát Triển & Chia Sẻ Dữ Liệu (Data Flow)

Kiến trúc này cho phép luồng phát triển diễn ra cực kỳ trơn tru theo quy trình:

1. **Định nghĩa Hợp Đồng:**
   - Thêm Interface vào `packages/shared-types/src/index.ts` (Ví dụ: `export interface ISong { id: string; url: string; }`).

2. **Tiêu Thụ Type-Safe:**
   - Backend (`apps/api`) import `ISong` để làm chuẩn trả dữ liệu (Response DTO).
   - Frontend (`apps/web`) import `ISong` để map dữ liệu vào UI Component.

3. **Đồng Bộ Hoá Real-time (HMR):**
   - Lệnh `pnpm dev` (chạy qua Turborepo) sẽ khởi động song song cả Web và API.
   - Mọi thay đổi bạn lưu ở `shared-types` sẽ lập tức kích hoạt Hot-Reload ở cả 2 đầu. Nếu có lỗi sai kiểu dữ liệu, Terminal sẽ báo lỗi đỏ ngay lập tức mà không cần build lại dự án.

---

## 5. 🛠️ Các Lệnh Thường Dùng (Commands)

Chạy tất cả các lệnh này tại **thư mục gốc (Root)**:

| Lệnh           | Ý nghĩa                                           |
| :------------- | :------------------------------------------------ |
| `pnpm install` | Cài đặt dependencies và tạo Symlink Workspace     |
| `pnpm dev`     | Chạy song song tất cả các apps (Next.js & NestJS) |
| `pnpm build`   | Build toàn bộ dự án với Turborepo Cache           |
| `pnpm format`  | Chạy Prettier format code toàn hệ thống           |
| `pnpm dev:web` | Chỉ chạy dev server cho Frontend (Web)            |
| `pnpm dev:api` | Chỉ chạy dev server cho Backend (API)             |
