# 🟨 GIAI ĐOẠN 1: NỀN TẢNG DỮ LIỆU & XÁC THỰC (Core API)

**Mục tiêu:** API chạy được, có JWT, lưu được User và bài hát vào MongoDB.

## 1.1. Định nghĩa Shared Types

Định nghĩa các Interface và Types dùng chung cho cả hệ thống (Backend, Frontend, Worker). Sử dụng Const Object kết hợp Type để thay thế Enum nhằm tránh lỗi khi compile ở chế độ strip-only.

- `packages/shared-types/src/index.ts`

## 1.2. Kết nối Database (apps/api)

### 1. Cài đặt thư viện cho apps/api

Mở terminal ở thư mục root của monorepo và chạy lệnh sau để cài đặt Mongoose vào package api:

```bash
pnpm --filter api add @nestjs/mongoose mongoose
pnpm --filter api add -D @types/mongoose
```

**Lưu ý:** _Bạn cũng cần `@nestjs/config` để đọc biến môi trường `.env`, nếu chưa có hãy chạy `pnpm --filter api add @nestjs/config`_

### 2. Định nghĩa User Schema

- `apps/api/src/users/schemas/user.schema.ts`

### 3. Định nghĩa Song Schema

- `apps/api/src/songs/schemas/song.schema.ts`

### 4. Cấu hình Database Module

Tạo module chịu trách nhiệm kết nối Database. Đảm bảo bạn có file `.env` chứa `MONGODB_URI` ở `apps/api`

- `apps/api/src/database/database.module.ts`

Sau đó, nhớ import `DatabaseModule` và `ConfigModule.forRoot({ isGlobal: true })` vào `app.module.ts`.

## 1.3. Xác thực người dùng (Auth)

### 1. Cài đặt các thư viện cần thiết

Chạy lệnh sau tại thư mục root để cài đặt Passport, JWT, Bcrypt và bộ Validate cho apps/api:

```bash
pnpm --filter api add @nestjs/jwt @nestjs/passport passport passport-jwt bcryptjs class-validator class-transformer
pnpm --filter api add -D @types/passport-jwt @types/bcryptjs
```

### 2. Tạo các DTO (Data Transfer Object)

Ràng buộc dữ liệu đầu vào (Validation) cho việc đăng ký và đăng nhập.

- `apps/api/src/auth/dto/register.dto.ts`
- `apps/api/src/auth/dto/login.dto.ts`

### 3. Logic Xác thực (Auth Service)

Xử lý hash mật khẩu, kiểm tra user tồn tại, và sinh token.

- `apps/api/src/auth/auth.service.ts`

### 4. Auth Controller & JWT Strategy

Tạo Controller để nhận request và JwtStrategy để bảo vệ các route khác.

- `apps/api/src/auth/auth.controller.ts`
- `apps/api/src/auth/strategies/jwt.strategy.ts`

### 5. Tạo Guard Bảo vệ (JwtAuthGuard)

Tạo custom Guard để chặn các request không có Token hợp lệ, trả về lỗi chuẩn theo API Document.

- `apps/api/src/auth/guards/jwt-auth.guard.ts`

### 6. Khai báo AuthModule

Gom tất cả (Controller, Service, Strategy, User Schema) vào AuthModule.

- `apps/api/src/auth/auth.module.ts`

### 7. Cấu hình Global (main.ts)

Bật Validation toàn cục (Global Pipes), setup Global Prefix (`/api/v1`) và kích hoạt CORS (`credentials: true`).

- `apps/api/src/main.ts`

## 1.4. API Metadata Cơ bản (Songs)

### 1. Tạo DTO cho Query Parameters

Sử dụng **Cursor-based Pagination** (thay vì skip/limit truyền thống) để tối ưu hiệu suất khi truy vấn danh sách lớn.

- `apps/api/src/songs/dto/get-songs-query.dto.ts`

### 2. Logic Xử lý Bài hát (Songs Service)

Viết logic truy vấn MongoDB: Lọc theo thể loại, tìm kiếm theo tên, phân trang cursor (sắp xếp theo `_id` giảm dần) và thiết lập Hard-cap Limit (Max 50 record) để bảo mật.

- `apps/api/src/songs/songs.service.ts`

### 3. Songs Controller

Tạo các Endpoint `GET /` và `GET /:id`, đính kèm `@UseGuards(JwtAuthGuard)` để yêu cầu xác thực bằng token.

- `apps/api/src/songs/songs.controller.ts`

### 4. Khai báo SongsModule

Gom Schema, Controller và Service lại thành một module độc lập và import vào `app.module.ts`

- `apps/api/src/songs/songs.module.ts`
