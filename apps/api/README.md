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

---

# 🚀 DOCUMENTATION: ARCHITECTURE & WORKFLOW (PHASE 1)

## 1. Kiến Trúc Tổng Quan

Hệ thống được xây dựng trên nền tảng **NestJS Monorepo**, tuân thủ nguyên tắc chia lớp (Layered Architecture) để đảm bảo tính bảo mật, khả năng mở rộng và dễ dàng bảo trì.

---

## 2. Chi Tiết Các Thành Phần & Liên Kết

### 🛡️ Lớp Cấu Hình & Khởi Tạo (The Entry Point)

- **`main.ts`**:
  - **Chức năng**: Cổng vào duy nhất của ứng dụng. Thiết lập `Global Prefix` (`/api/v1`), cấu hình `CORS` với `credentials: true` để hỗ trợ Signed Cookies/Tokens, và kích hoạt `ValidationPipe` toàn cục.
  - **Liên kết**: Sử dụng `class-validator` để tự động lọc dữ liệu rác (whitelist) và chặn các trường lạ (forbidNonWhitelisted) từ Client gửi lên.
- **`app.module.ts`**:
  - **Chức năng**: "Bộ não" trung tâm điều phối và khởi tạo các Dependency Injection.
  - **Liên kết**: Import `ConfigModule` để cung cấp biến môi trường toàn cục và `DatabaseModule` để thiết lập kết nối Mongoose.

### 🔑 Lớp Xác Thực & Bảo Mật (The Security Guard)

Lớp này chịu trách nhiệm định danh và bảo vệ tài nguyên hệ thống.

- **`auth.service.ts`**:
  - **Chức năng**: Xử lý logic nghiệp vụ như băm (hash) mật khẩu bằng `bcryptjs` và phát hành JWT (Access/Refresh Token).
  - **Liên kết**: Sử dụng `UserModel` để tương tác với MongoDB và `JwtService` để tạo chuỗi mã hóa.
- **`jwt.strategy.ts`**:
  - **Chức năng**: Một Middleware chuyên biệt dùng để giải mã (decode) và xác thực tính hợp lệ của Token từ Header `Authorization`.
  - **Liên kết**: Trích xuất thông tin người dùng (payload) và đính kèm vào đối tượng `request.user` cho các bước xử lý sau.
- **`jwt-auth.guard.ts`**:
  - **Chức năng**: "Vệ sĩ" đứng trước các Controller nhạy cảm.
  - **Liên kết**: Gọi đến `JwtStrategy` để xác thực. Nếu Token không hợp lệ, nó sẽ chặn request và trả về lỗi chuẩn hóa.

### 📊 Lớp Dữ Liệu & Xử Lý (The Data & Logic Layer)

- **`user.schema.ts` & `song.schema.ts`**:
  - **Chức năng**: Định nghĩa cấu trúc dữ liệu bền vững cho MongoDB.
  - **Liên kết**: Cung cấp Model cho các Service thực hiện truy vấn dữ liệu.
- **`songs.service.ts`**:
  - **Chức năng**: Thực thi logic tìm kiếm bài hát theo thể loại, tên và phân trang.
  - **Liên kết**: Triển khai **Cursor-based Pagination** (dựa trên `_id`) giúp tối ưu hiệu suất và ngăn chặn lỗi hiệu năng khi dữ liệu bài hát lớn dần.
- **`songs.controller.ts`**:
  - **Chức năng**: Tiếp nhận các yêu cầu HTTP (`GET /`, `GET /:id`).
  - **Liên kết**: Được bảo vệ bởi `@UseGuards(JwtAuthGuard)`, đảm bảo chỉ người dùng đã đăng nhập mới xem được thông tin bài hát.

---

## 🔄 Phân Tích Luồng Xử Lý (Request Flow)

### A. Luồng Đăng Ký / Đăng Nhập

1. **Client**: Gửi request `POST /auth/register` hoặc `/auth/login` kèm dữ liệu JSON.
2. **Validation Layer**: `main.ts` kiểm tra tính hợp lệ của dữ liệu thông qua `RegisterDto` hoặc `LoginDto`.
3. **AuthService**:
   - Kiểm tra User tồn tại trong Database.
   - Hash mật khẩu (Register) hoặc so sánh mật khẩu (Login).
   - Trả về cặp Token (Access & Refresh).

### B. Luồng Truy Cập Dữ Liệu Bảo Mật (Lấy danh sách nhạc)

1. **Client**: Gửi request `GET /songs` kèm `Authorization: Bearer <Token>`.
2. **Guard Layer**: `JwtAuthGuard` chặn lại và yêu cầu `JwtStrategy` kiểm tra Token.
3. **Strategy Layer**: Giải mã Token bằng `JWT_SECRET`. Nếu hợp lệ, cho phép request đi tiếp vào Controller.
4. **Service Layer**: `SongsService` truy vấn MongoDB, áp dụng phân trang Cursor và trả kết quả về cho Controller.
5. **Response**: Trả về danh sách bài hát (tối đa 50 bản ghi) dưới định dạng JSON sạch sẽ.

---

## 🛠️ Trạng Thái Hoàn Thành Giai Đoạn 1

- ✅ **Hệ thống Auth**: Hoàn thiện Login/Signup với bảo mật Bcrypt.
- ✅ **Phân quyền**: Áp dụng thành công JWT Guard cho tài nguyên bài hát.
- ✅ **Hiệu năng**: Cơ chế Cursor-based pagination sẵn sàng cho dữ liệu lớn.
- ✅ **Cấu trúc**: Monorepo sạch sẽ, các file thừa đã được dọn dẹp.

---

_Tài liệu này được tạo ra để đảm bảo sự hiểu biết đồng nhất về kiến trúc hệ thống trước khi triển khai Giai đoạn 2: KMS & Media Security._
