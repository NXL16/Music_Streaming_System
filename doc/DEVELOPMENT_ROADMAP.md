# 🚀 Lộ Trình Thực Thi Dự Án - Music Streaming HLS v2.0

**Mục tiêu:** Cung cấp trình tự code logic nhất để các module không bị "đợi" nhau (blockers). Xây dựng từ Database -> API -> Security -> Worker -> Frontend.

---

## 🟨 GIAI ĐOẠN 1: NỀN TẢNG DỮ LIỆU & XÁC THỰC (Core API)

_Tại sao làm trước? Mọi component khác (Worker, Frontend) đều cần gọi API và cần Interface để giao tiếp._

**Mục tiêu (Milestone):** API chạy được, có JWT, lưu được User và bài hát (dạng text) vào MongoDB.

- [x] **1.1. Định nghĩa Shared Types:**
  - Viết `IUser`, `ISong`, `IPlaylist` trong `packages/shared-types`.
  - Viết cấu trúc dữ liệu cho queue: `ITranscodeJob`.
- [x] **1.2. Kết nối Database (apps/api):**
  - Setup `MongooseModule` kết nối MongoDB.
  - Viết Schema cho `User` và `Song`.
- [x] **1.3. Xác thực người dùng (Auth):**
  - Cài đặt Passport & JWT.
  - Viết API `POST /auth/signup` (Bcrypt hash password).
  - Viết API `POST /auth/login` (Trả về Access Token).
  - Viết Guard `@UseGuards(JwtAuthGuard)` để bảo vệ các route khác.
- [ ] **1.4. API Metadata Cơ bản:**
  - Viết API `GET /songs` (Lấy danh sách).
  - Viết API `GET /songs/:id` (Lấy chi tiết).
  - Tạm thời mock data hoặc dùng Postman tạo 1-2 record bài hát để test.

---

## 🟥 GIAI ĐOẠN 2: TRÁI TIM BẢO MẬT (KMS Microservice)

_Tại sao làm bước này? Vì Worker cần lấy khóa (Key) để mã hóa file nhạc. Nếu không có KMS, Worker không thể transcode được HLS._

**Mục tiêu:** KMS sinh được khóa AES-128 và API Gateway gọi được KMS qua gRPC.

- [ ] **2.1. Khởi tạo KMS (apps/kms):**
  - Setup TypeORM kết nối MySQL (Tạo bảng `keys` và `audit_logs`).
  - Cấu hình NestJS chạy dưới dạng gRPC Server (Microservice).
- [ ] **2.2. Logic Sinh & Cấp Khóa:**
  - Viết hàm Node.js Crypto tạo 16-byte AES Key và IV.
  - Viết gRPC method `GenerateKey` (Sinh khóa mới, lưu vào MySQL).
  - Viết gRPC method `GetKey` (Lấy khóa để giải mã).
- [ ] **2.3. Cầu nối API -> KMS:**
  - Ở `apps/api`, setup gRPC Client để gọi sang `apps/kms`.
  - Test luồng: Gọi 1 API ở cổng 3000 -> API gọi gRPC sang cổng 5000 -> KMS trả về khóa.

---

## 🟦 GIAI ĐOẠN 3: NHÀ MÁY CHẾ BIẾN (Transcoding Worker & Queue)

_Tại sao làm bước này? Đã có Database lưu thông tin, đã có KMS tạo khóa, giờ là lúc chế biến file MP3 gốc thành HLS._

**Mục tiêu:** Upload file MP3 -> Tự động cắt thành `.ts` (đã mã hóa) -> Đẩy lên Cloudflare R2.

- [ ] **3.1. Hàng đợi BullMQ (apps/api):**
  - Cấu hình Redis.
  - Viết API `POST /admin/upload` (Nhận file MP3, lưu tạm, push 1 Job vào BullMQ).
- [ ] **3.2. Worker Khởi động (tools/transcoding-worker):**
  - Setup Worker kết nối cùng Redis để kéo Job về xử lý.
  - Tích hợp gọi KMS (để xin khóa mã hóa cho file đang xử lý).
- [ ] **3.3. Xử lý FFmpeg (The Hard Part):**
  - Dùng `child_process` gọi lệnh FFmpeg chia file MP3 thành các đoạn HLS `.ts` (4 giây/đoạn).
  - Apply khóa AES-128 từ KMS vào lệnh FFmpeg để mã hóa các đoạn `.ts` này.
  - Dùng `sharp` tạo cover ảnh (Thumbnail/BlurHash).
- [ ] **3.4. Lưu trữ (Cloudflare R2):**
  - Dùng AWS S3 SDK (tương thích R2) upload toàn bộ thư mục HLS (`.m3u8` và `.ts`) lên Cloud.
  - Cập nhật MongoDB qua API: `status = 'ready'`, update đường dẫn file.

---

## 🟩 GIAI ĐOẠN 4: PHÂN PHỐI & EDGE SECURITY

_Tại sao làm bước này? Nhạc đã nằm trên Cloud, nhưng cần cơ chế an toàn (Signed Cookie) để giao file `.m3u8` cho Client._

**Mục tiêu:** Client lấy được danh sách phát mà không bị lộ link gốc.

- [ ] **4.1. Ký Cookie (apps/api):**
  - Viết hàm tạo HMAC Signed Cookies.
  - Viết API `GET /stream/manifest/:songId`. API này kiểm tra JWT, nếu OK thì trả về file `.m3u8` và đính kèm Signed Cookie vào Header.
- [ ] **4.2. Khóa Giải Mã (apps/api):**
  - Viết API `GET /stream/key/:songId`. API này kiểm tra JWT, gọi sang KMS để lấy khóa thô trả về cho Frontend.
- [ ] **4.3. Cloudflare Worker (Tùy chọn/Làm sau cũng được):**
  - Viết 1 script nhỏ trên Cloudflare để chặn các request tải `.ts` nếu không có Signed Cookie hợp lệ.

---

## 🟧 GIAI ĐOẠN 5: GIAO DIỆN NGƯỜI DÙNG (Frontend Next.js)

_Tại sao làm cuối? Vì lúc này mọi luồng Backend (Data, Auth, HLS, Key) đều đã chạy trơn tru, FE chỉ việc ráp vào UI._

**Mục tiêu:** Người dùng đăng nhập, tìm bài hát, bấm Play và nhạc vang lên.

- [ ] **5.1. Dựng Layout & Auth (apps/web):**
  - Dựng UI bằng Tailwind CSS (Sidebar, Header, Player bar).
  - Tích hợp Zustand lưu trạng thái (Đang phát bài gì, Volume bao nhiêu).
  - Làm trang Login/Signup (Lưu JWT vào localStorage hoặc HttpOnly Cookie).
- [ ] **5.2. Danh sách & Khám phá:**
  - Trang chủ: Fetch danh sách bài hát từ API, hiển thị ảnh Thumbnail và Title.
  - Tích hợp BlurHash để hiện ảnh mờ trong lúc đợi tải cover thật.
- [ ] **5.3. HLS Player (The Hard Part):**
  - Cài đặt `hls.js`.
  - Khởi tạo Player khi user bấm Play một bài hát.
  - **Xử lý mã hóa:** Viết custom loader cho `hls.js` chặn sự kiện `#EXT-X-KEY`. Gọi API `/stream/key/:id` để lấy khóa -> Đưa vào RAM cho `hls.js` giải mã file `.ts` -> Phát nhạc.

---

## 🟪 GIAI ĐOẠN 6: HOÀN THIỆN & ADMIN DASHBOARD

_Giai đoạn đánh bóng sản phẩm._

- [ ] **6.1. UI Admin Upload:**
  - Form kéo thả file âm thanh.
  - Hiển thị thanh Progress Bar lấy trạng thái từ BullMQ (Đang xử lý 50%, Đang upload...).
- [ ] **6.2. Playlist (Người dùng):**
  - CRUD Playlist cá nhân, thêm/xóa bài hát vào playlist.
- [ ] **6.3. Tracking & History:**
  - Lắng nghe event của Hls.js (đã nghe được 50% bài hát) -> Bắn API lưu lịch sử nghe nhạc.

---

## 💡 Mẹo sử dụng Lộ trình này:

- Hãy làm **triệt để từng Giai đoạn một**. Đừng nhảy sang code giao diện Player (GĐ 5) khi chưa có API trả file `.m3u8` (GĐ 4).
- Ở GĐ 3 (FFmpeg Worker), ban đầu bạn **khoảng hãy mã hóa AES vội**. Cứ dùng FFmpeg cắt file MP3 thành HLS thường trước để test luồng Upload -> R2 có chạy không đã. Chạy ngon rồi mới nhúng khóa AES vào lệnh FFmpeg sau.
