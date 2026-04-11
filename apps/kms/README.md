# GIAI ĐOẠN 2: TRÁI TIM BẢO MẬT (KMS Microservice)

**Tại sao làm bước này?** Vì Worker cần lấy khóa (Key) để mã hóa file nhạc. Nếu không có KMS, Worker không thể transcode được file âm thanh sang định dạng HLS bảo mật.
**Mục tiêu:** KMS sinh được khóa AES-128, lưu trữ an toàn vào MySQL và API Gateway (`apps/api`) gọi được KMS qua giao thức gRPC.

## 2.1. Khởi tạo KMS (apps/kms)

### 1. Cài đặt thư viện cho apps/kms
Mở terminal ở thư mục root và cài đặt các package gRPC, TypeORM và MySQL cho microservice KMS:
```bash
pnpm --filter kms add @nestjs/microservices @grpc/grpc-js @grpc/proto-loader typeorm @nestjs/typeorm mysql2 @nestjs/config
```

### 2. Định nghĩa Hợp đồng giao tiếp (Protocol Buffer)
Sử dụng `.proto` làm chuẩn giao tiếp thay cho JSON, đảm bảo tốc độ cao và Type-safe giữa các service.
- `apps/kms/proto/key-management.proto`
*(File này sau đó được copy một bản sang `apps/api/proto/key-management.proto`)*

### 3. Cấu hình gRPC Server (main.ts)
Chuyển đổi NestJS từ HTTP Server sang gRPC Microservice chạy ở port 5000. Thêm cấu hình `keepCase: true` để giữ nguyên chuẩn snake_case từ file proto.
- `apps/kms/src/main.ts`

### 4. Kết nối Database MySQL & Định nghĩa Entity
Sử dụng TypeORM kết nối MySQL, định nghĩa bảng `keys` lưu trữ khóa AES dưới dạng `BLOB` (nhị phân) và `IV` dưới dạng `VARCHAR`.
- `apps/kms/src/database/entities/key.entity.ts`
- `apps/kms/src/database/database.module.ts`

## 2.2. Logic Sinh & Cấp Khóa

### 1. Xử lý Crypto & TypeORM (KeyManagement Service)
Sử dụng module `crypto` của Node.js để sinh ngẫu nhiên 16 bytes (AES-128 Key) và 16 bytes (IV). Kiểm tra khóa trùng lặp và lưu vào Database.
- `apps/kms/src/key-management/key-management.service.ts`

### 2. Khởi tạo gRPC Controller
Sử dụng decorator `@GrpcMethod()` để ánh xạ các logic sinh khóa và lấy khóa ra cổng giao tiếp gRPC.
- `apps/kms/src/key-management/key-management.controller.ts`

### 3. Khai báo KeyManagementModule
Gom Controller, Service và Entity lại với nhau.
- `apps/kms/src/key-management/key-management.module.ts`

## 2.3. Cầu nối API Gateway -> KMS

### 1. Cài đặt thư viện gRPC cho apps/api
```bash
pnpm --filter api add @nestjs/microservices @grpc/grpc-js @grpc/proto-loader
```

### 2. Tạo KMS Client Service
Khai báo interface Typescript (như `Uint8Array`) để mapping với kiểu `bytes` của protobuf. Dùng `lastValueFrom` để chuyển đổi `Observable` của RxJS sang `Promise`. Sử dụng toán tử `!` để vượt qua kiểm tra nghiêm ngặt của ESLint.
- `apps/api/src/kms/kms.service.ts`

### 3. Cấu hình KMS Module
Đăng ký `ClientsModule` trỏ tới địa chỉ `localhost:5000` của KMS.
- `apps/api/src/kms/kms.module.ts`

### 4. API Test Luồng gRPC (Tạm thời)
Tạo một HTTP GET endpoint ở API để chọc thử sang KMS, kiểm tra xem dữ liệu Hex có được trả về thành công không.
- `apps/api/src/kms/kms.controller.ts`

---

# 🚀 DOCUMENTATION: ARCHITECTURE & WORKFLOW (PHASE 2)

## 1. Kiến Trúc Tổng Quan (Microservices)

Chuyển đổi từ kiến trúc Monolithic (nguyên khối) sang dạng **Microservices Architecture**.

- **`apps/api` (API Gateway)**: Tương tác với người dùng qua Internet (REST/HTTP).
- **`apps/kms` (Key Management Service)**: Ẩn mình hoàn toàn khỏi Internet, chỉ giao tiếp nội bộ với hệ thống thông qua giao thức **gRPC** tốc độ cao.

---

## 2. Chi Tiết Các Thành Phần & Liên Kết

### 📜 Lớp Hợp Đồng Giao Tiếp (The Contract)

- **`key-management.proto`**:
  - **Chức năng**: Bản hợp đồng duy nhất quy định dữ liệu đầu vào (`song_id`, `user_id`) và đầu ra (`key`, `iv`) giữa hai server. Ngôn ngữ độc lập.

### 🗄️ Lớp Dữ Liệu Bảo Mật (KMS Database)

- **`key.entity.ts`**:
  - **Chức năng**: Lược đồ database MySQL lưu trữ thông tin cực kỳ nhạy cảm. Khóa (`keyBinary`) được lưu dưới dạng Binary Blob để tránh rủi ro do chuyển đổi encoding, chuỗi khởi tạo (`iv`) lưu dạng Hex.

### 🔐 Lớp Sinh Khóa (The Crypto Engine)

- **`key-management.service.ts` (KMS)**:
  - **Chức năng**: Trái tim của hệ thống bảo mật. Dùng `crypto.randomBytes(16)` để tạo khóa AES-128 đúng chuẩn dùng cho giao thức HLS. Đảm bảo 1 bài hát chỉ có 1 khóa kích hoạt (isActive: true).

### 📡 Lớp Giao Tiếp (The RPC Client)

- **`kms.service.ts` (API)**:
  - **Chức năng**: Đóng vai trò là đại sứ (Client) đại diện cho API đi hỏi khóa từ KMS.
  - **Liên kết**: Ép kiểu dữ liệu nghiêm ngặt bằng TypeScript (loại bỏ `any`), giúp luồng code ở API sạch sẽ và an toàn tuyệt đối.

---

## 🔄 Phân Tích Luồng Xử Lý (gRPC Request Flow)

### Luồng Yêu Cầu Khóa Mã Hóa (Generate Key)

1. **Trigger**: Một Controller hoặc Worker bên `apps/api` gọi hàm `this.kmsService.generateKey(songId, userId)`.
2. **Serialization (Mã hóa gói tin)**: `gRPC Client` tại API nén dữ liệu thành định dạng nhị phân (Protobuf) và bắn qua TCP đến port 5000.
3. **Deserialization (KMS Nhận)**: Gói tin đến `apps/kms`, được giải nén và chuyển vào `@GrpcMethod('KeyManagement', 'GenerateKey')`.
4. **Logic Xử Lý**:
   - KMS truy vấn MySQL kiểm tra: Bài hát này có khóa chưa?
   - Nếu có: Trả về khóa cũ.
   - Nếu chưa: Sinh 16-byte ngẫu nhiên cho Key & IV -> `INSERT INTO keys` -> Trả về khóa mới.
5. **Response**: KMS đóng gói nhị phân kết quả, gửi ngược lại TCP.
6. **API Nhận Kết Quả**: Hàm `lastValueFrom()` giải quyết Promise, API nhận được `Uint8Array` chứa `key` và `iv` để sẵn sàng chuyển đi cho FFmpeg xử lý HLS.

---

## 🛠️ Trạng Thái Hoàn Thành Giai Đoạn 2

- ✅ **gRPC Server & Client**: Thiết lập giao tiếp thành công, giải quyết triệt để lỗi biến đổi `snake_case` (keepCase: true).
- ✅ **MySQL Storage**: Kết nối và lưu trữ khóa dạng Binary an toàn.
- ✅ **Crypto Logic**: Thuật toán AES-128 sẵn sàng cấp khóa.
- ✅ **TypeScript Strict**: Code sạch sẽ, pass toàn bộ rule khắt khe của ESLint.

---

_Tài liệu này đánh dấu sự hình thành của hệ thống Microservices. Giai đoạn tiếp theo (Phase 3) sẽ đưa luồng dữ liệu vào hệ thống Message Queue (BullMQ) để thực hiện quá trình Transcoding (cắt nhạc HLS) nặng nề._
