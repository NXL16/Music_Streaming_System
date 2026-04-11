# 🔐 Bảo Mật - Hệ Thống Phát Nhạc Trực Tuyến

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07

---

## 📑 Mục Lục

1. [Tổng Quan Bảo Mật](#tổng-quan-bảo-mật)
2. [Xác Thực & Phân Quyền](#xác-thực--phân-quyền)
3. [Mã Hóa Dữ Liệu](#mã-hóa-dữ-liệu)
4. [Transport Security](#transport-security)
5. [Bảo Vệ Nội Dung](#bảo-vệ-nội-dung)
6. [Bảo Vệ API](#bảo-vệ-api)
7. [Phòng Chống Tấn Công](#phòng-chống-tấn-công)
8. [Compliance & Audit](#compliance--audit)
9. [Best Practices](#best-practices)

---

## 🎯 Tổng Quan Bảo Mật

### Nguyên Tắc Zero Trust

```
┌─────────────────────────────────────────────┐
│ TẤT CẢ TRAFFIC ĐỀU PHẢI XÁC THỰC & MÃ HÓA  │
├─────────────────────────────────────────────┤
│ 1. Không có trusted network                 │
│ 2. Xác thực tất cả users & devices          │
│ 3. Verify từng request                      │
│ 4. Encrypt tất cả data in-transit & at-rest │
│ 5. Monitor & log mọi hoạt động              │
└─────────────────────────────────────────────┘
```

### Lớp Bảo Vệ

```
┌──────────────────────────────────────┐
│ Lớp 5: Data Encryption (AES-128)    │
├──────────────────────────────────────┤
│ Lớp 4: Key Management (KMS gRPC)    │
├──────────────────────────────────────┤
│ Lớp 3: Transport (TLS 1.3)          │
├──────────────────────────────────────┤
│ Lớp 2: API Gateway (JWT, mTLS)      │
├──────────────────────────────────────┤
│ Lớp 1: Edge Security (Cloudflare)   │
├──────────────────────────────────────┤
│ Lớp 0: Network (WAF, DDoS)          │
└──────────────────────────────────────┘
```

---

## 🔐 Xác Thực & Phân Quyền

### 1. Xác Thực (Authentication)

#### JWT Token Structure

```
Header:
{
  "alg": "HS256",
  "typ": "JWT"
}

Payload:
{
  "sub": "507f1f77bcf86cd799439011",  // Subject (User ID)
  "username": "john_doe",
  "role": "user",
  "email": "john@example.com",
  "iat": 1680854400,                   // Issued At
  "exp": 1680940800,                   // Expiration (24 hours)
  "iss": "music-streaming.yourdomain", // Issuer
  "aud": "music-streaming-api",        // Audience
  "deviceFP": "device_fp_hash"         // Device Fingerprint
}

Signature:
HMACSHA256(
  base64UrlEncode(header) + "." +
  base64UrlEncode(payload),
  secret
)
```

#### Token Lifecycle

```
┌─────────────────┐
│ User Login      │
│ username +      │
│ password        │
└────────┬────────┘
         │
         ▼
┌──────────────────────────┐
│ Verify Credentials       │ (Bcrypt compare)
│ & Device Fingerprint     │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Generate JWT Tokens:     │
│ - accessToken (24h)      │
│ - refreshToken (7d)      │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Store in:                │
│ - localStorage (JWT)     │
│ - HttpOnly Cookie (RT)   │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Upcoming Request:        │
│ Header: "Authorization: │
│ Bearer <accessToken>"    │
└────────┬─────────────────┘
         │
         ▼
┌──────────────────────────┐
│ Verify JWT:              │
│ - Check signature        │
│ - Check expiration       │
│ - Check payload          │
└────────┬─────────────────┘
         │
    ┌────┴────────┬─────────────┐
    │             │             │
    ▼ Valid   ❌ Expired   ❌ Invalid
    │         └─────┬──────┘
    │               │
    ▼               ▼
  ✅ OK      POST /auth/refresh
           (sử dụng refreshToken)
                  │
                  ▼
            ✅ New accessToken
               hoặc
              ❌ Redirect login
```

#### Bcrypt Password Hashing

```
User Password: "SecurePassword123!"
                    │
                    ▼
         Bcrypt Hash (Cost: 12)
                    │
                    ▼
  $2b$12$JZd8dIsHfx3z.AWCOzSnCON9j/NrwxVgHQi0HeWQe4zNQRtf0xfm.
  └────────────────────────────────────────────────────────────┘
       Lưu trong Database

Authentication:
  Bcrypt Compare(user_password, hashed_password)
  │
  ├─ Match ✅ → Login Success
  └─ No Match ❌ → Login Failed
```

---

### 2. Device Fingerprinting

#### Tạo Fingerprint

```javascript
// Device Fingerprint = SHA-256 Hash của các thành phần

Components:
├─ User Agent (browser identifier)
├─ Hardware Concurrency (# of CPU cores)
├─ Memory (available memory)
├─ Screen Resolution (width x height)
├─ Timezone (user timezone)
├─ Language (browser language)
├─ Canvas Fingerprint (WebGL rendering)
└─ WebGL Fingerprint (GPU capabilities)

Example:
Mozilla/5.0 (Windows NT 10.0; Win64; x64) + 8 cores + 16GB + 1920x1080 + UTC+7
     │
     ▼
SHA-256 Hash
     │
     ▼
"a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
```

#### Xác Minh Device Binding

```
User Device 1:
Device FP: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"

Request từ Device 1:
Headers: Device-FP: "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6"
         │
         ▼
Compare với Stored Device FP
         │
    ┌────┴────────────────┐
    │                     │
    ▼ Match ✅        ❌ No Match
    │                  │
    │              Log suspicious activity
    │              Increment failed counter
    │              │
    │              └─ > 3 failed → Lock account (1h)
    │                 & Send alert email
    │
    ▼
Allow Request
```

---

### 3. Phân Quyền (Authorization)

#### Role-Based Access Control (RBAC)

```
Roles:
├─ user (người dùng thường)
│  ├─ View songs
│  ├─ Play music
│  ├─ Create playlists
│  ├─ Like songs
│  └─ View own profile
│
└─ admin (quản trị viên)
   ├─ Upload songs (all from user role)
   ├─ Delete songs
   ├─ View analytics
   ├─ Manage users
   ├─ View audit logs
   └─ View system statistics
```

#### Decorator-based Authorization

```typescript
// apps/api/src/auth/admin.decorator.ts

@Authorized('admin')
class AdminController {
  @Post('upload')
  @Authorized('admin')
  async uploadSong() { ... }
}

// Guard kiểm tra
@UseGuards(JwtAuthGuard, AdminGuard)
async uploadSong() { ... }
```

---

## 🔒 Mã Hóa Dữ Liệu

### 1. At-Rest Encryption

#### MongoDB Encryption

```
Original Data (Plaintext):
{
  username: "john_doe",
  email: "john@example.com",
  password: "SecurePassword123!"
}
         │
         ▼
Apply Encryption:
- Fields: password, email (sensitive)
- Algorithm: AES-256-CBC
- Key: Master Encryption Key (MEK)
         │
         ▼
Stored (Ciphertext):
{
  username: "john_doe",                    // Not encrypted (indexed)
  email: "3f7k9d2e4m1x5c8b...",           // Encrypted
  password: "$2b$12$...",                   // Bcrypt (one-way)
}
```

#### MySQL Encryption (KMS)

```
Key Storage:
┌────────────────────────────────────┐
│ AES-128 Key (per song)             │
│ 16 bytes = 128 bits                │
│                                    │
│ Example (hex):                     │
│ 0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d  │
└────────────────────────────────────┘
         │
         ▼
Encrypt with Master Encryption Key (MEK)
         │
         ▼
Store as BLOB:
┌──────────────────────────────────────┐
│ Binary encrypted data                │
│ (256 bytes encrypted from 16 bytes)  │
└─────��────────────────────────────────┘
         │
         ▼
Each Request:
1. Retrieve encrypted key from MySQL
2. Decrypt with MEK in KMS
3. Return to client (via TLS)
4. Cache 5 minutes in Redis
```

### 2. In-Transit Encryption

#### HLS Segment Encryption

```
Original Audio Segment (4 seconds):
┌─────────────────────┐
│ MP3 Audio Data      │
│ ~400 KB             │
└─────────────────────┘
         │
         ▼
FFmpeg + OpenSSL:
Algorithm: AES-128-CBC
IV: Random 16 bytes (regenerated per segment)
Key: Retrieved from KMS
         │
         ▼
┌─────────────────────┐
│ Encrypted Segment   │
│ (.ts file)          │
│ ~400 KB (same size) │
└─────────────────────┘
         │
         ▼
Upload to R2 (encrypted)
         │
         ▼
Client Download:
1. GET segment (HTTPS/TLS)
2. Validate signed cookie
3. Verify device binding
4. Receive encrypted segment
5. Decrypt in browser RAM
6. Play audio
         │
         ▼
⚠️ IMPORTANT: Never write to disk!
   All decryption happens in RAM
```

#### TLS Configuration

```
TLS Version: 1.3 (Required)
Cipher Suites:
├─ TLS_AES_256_GCM_SHA384 (preferred)
├─ TLS_CHACHA20_POLY1305_SHA256
└─ TLS_AES_128_GCM_SHA256

Certificate:
├─ Issued by: Let's Encrypt (free)
├─ Valid for: yourdomain.com & *.yourdomain.com
├─ Auto-renewal: 90 days
└─ HSTS enabled: max-age=31536000

Client ─── TLS 1.3 (Encrypted) ──→ Server
                                      │
                                      ▼
                            Certificate verified
                            ✅ Secure connection
```

---

## 🛡️ Transport Security

### HTTPS Enforcement

```
HTTP Request:
http://api.yourdomain.com/api/v1/songs
        │
        ▼
301 Permanent Redirect
        │
        ▼
HTTPS Request:
https://api.yourdomain.com/api/v1/songs
        │
        ▼
TLS Handshake
        │
        ├─ Client Hello
        ├─ Server Hello (Certificate)
        ├─ Key Exchange
        ├─ Cipher Change
        └─ Finished
        │
        ▼
✅ Encrypted Connection Established
```

### HSTS (HTTP Strict Transport Security)

```
Response Header:
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload

Effect:
- Browser: Mỗi request đến yourdomain.com → tự động HTTPS
- Duration: 1 năm (31536000 giây)
- Subdomain: Áp dụng cho *.yourdomain.com
- Preload: Thêm vào HSTS preload list (browsers mặc định HTTPS)
```

---

## 🎵 Bảo Vệ Nội Dung

### Luồng Bảo Vệ Toàn Diện

```
1. Upload (Admin)
   File (MP3) → Validate → Transcode → Encrypt (AES-128) → R2

2. Distribution
   R2 → Cloudflare R2 → Cloudflare CDN
   (Content encrypted, no public access)

3. Access Control
   User Request → Cloudflare Worker → Validate Signed Cookie
                                    → Device Binding Check
                                    → Rate Limit
                                    → Bot Detection
                                    → Forward to R2

4. Playback
   Get Manifest → Hls.js Parse → Request Segments
                               → Request Key (gRPC to KMS)
                               → Decrypt in RAM
                               → Play Audio

5. Anti-Piracy
   ├─ No direct URL access (signed cookies)
   ├─ No file caching (in-memory only)
   ├─ Device binding (prevent sharing)
   ├─ Account monitoring (suspicious activity)
   └─ Audit logging (compliance)
```

### Tấn Công Bị Ngăn Chặn

| Kiểu Tấn Công            | Phòng Chống                       | Kết Quả                     |
| :----------------------- | :-------------------------------- | :-------------------------- |
| **Share link trực tiếp** | Signed cookie hết hạn 30 phút     | ✅ Link expired sau 30 phút |
| **Tải với IDM**          | Cookie chỉ dùng với device chính  | ✅ IDM tải fail             |
| **Đánh cắp khóa**        | Khóa chỉ ở RAM, không lưu         | ✅ Không có khóa nào để lấy |
| **Chia sẻ tài khoản**    | Device fingerprint + IP check     | ✅ Phát hiện & lock account |
| **Reverse engineering**  | AES-128 mã hóa + code obfuscation | ✅ Mã hóa mạnh, khó hack    |
| **MITM attack**          | TLS 1.3 end-to-end                | ✅ Tất cả traffic encrypted |
| **Brute force**          | Rate limit + exponential backoff  | ✅ Account locked 1h        |

---

## 🚨 Bảo Vệ API

### Rate Limiting

```
Endpoint: /api/v1/stream/key/:songId

Limit: 5 requests per 10 seconds per user

Timeline:
├─ T=0:   Request 1 ✅
├─ T=1:   Request 2 ✅
├─ T=2:   Request 3 ✅
├─ T=3:   Request 4 ✅
├─ T=4:   Request 5 ✅
├─ T=5:   Request 6 ❌ (Rate limited - 429)
│         Retry-After: 5
├─ T=10:  Counter Reset
└─ T=11:  Request 6 ✅
```

### CORS (Cross-Origin Resource Sharing)

```
CORS Policy:
const ALLOWED_ORIGINS = [
  'https://yourdomain.com',
  'https://www.yourdomain.com',
  'https://app.yourdomain.com',
  'https://admin.yourdomain.com'
];

Response Headers:
Access-Control-Allow-Origin: https://yourdomain.com
Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization, Device-FP
Access-Control-Allow-Credentials: true
Access-Control-Max-Age: 86400
```

### CSP (Content Security Policy)

```
Header:
Content-Security-Policy:
  default-src 'self';
  script-src 'self' https://cdn.jsdelivr.net;
  style-src 'self' https://cdn.jsdelivr.net 'unsafe-inline';
  img-src 'self' https://r2.yourdomain.com https://cdn.yourdomain.com;
  media-src https://r2.yourdomain.com;
  connect-src 'self' https://api.yourdomain.com;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';

Purpose: Prevent:
- Cross-site scripting (XSS)
- Injection attacks
- Clickjacking
```

---

## 🔍 Phòng Chống Tấn Công

### 1. SQL Injection Prevention

```javascript
// ❌ UNSAFE - Don't do this
const query = `SELECT * FROM users WHERE username = '${username}'`;

// ✅ SAFE - Use parameterized queries
const query = `SELECT * FROM users WHERE username = ?`;
db.query(query, [username]);

// Using Mongoose (MongoDB)
User.findOne({ username: username }); // Safe by default
```

### 2. XSS Prevention

```javascript
// ❌ UNSAFE - Direct HTML injection
return `<p>${userInput}</p>`;

// ✅ SAFE - Escape HTML entities
import DOMPurify from "dompurify";
return `<p>${DOMPurify.sanitize(userInput)}</p>`;

// React (safe by default)
return <p>{userInput}</p>; // React escapes automatically
```

### 3. CSRF Prevention

```
CSRF Token Flow:

1. Server generates token
   csrfToken = generateRandomToken()
   Store in session

2. Send to client
   Response Header: X-CSRF-Token: abc123def456

3. Client includes in request
   POST /api/v1/songs
   Headers: X-CSRF-Token: abc123def456

4. Server validates
   if (request.csrfToken !== session.csrfToken) {
     return 403 Forbidden
   }
```

### 4. DDoS Protection

```
Cloudflare DDoS Shield:

Layer 3-4 DDoS (Network level):
├─ Rate limiting
├─ Traffic shaping
├─ Bot fingerprinting
└─ Geo-blocking

Layer 7 DDoS (Application level):
├─ Challenges (CAPTCHA, JavaScript)
├─ IP reputation checks
├─ Behavioral analysis
└─ Machine learning detection

Response:
High Attack ─┬─→ Challenge
             │
             └─→ Throttle
             │
             └─→ Block
```

---

## 📋 Compliance & Audit

### Logging & Monitoring

```
Events được log:

1. Authentication:
   ├─ Login (success/failure)
   ├─ Logout
   ├─ Token refresh
   └─ Failed attempts (> 3 → lock)

2. Authorization:
   ├─ Access denied
   ├─ Privilege escalation attempts
   └─ Permission changes

3. Data Access:
   ├─ Key retrieval
   ├─ File download
   └─ Database queries

4. Security:
   ├─ Device binding failure
   ├─ Rate limit exceeded
   ├─ Suspicious activity
   └─ Potential attacks

Log Format:
{
  timestamp: "2026-04-07T10:00:00Z",
  event: "KEY_ACCESSED",
  userId: "507f1f77bcf86cd799439011",
  songId: "507f1f77bcf86cd799439012",
  deviceFingerprint: "a1b2c3d4...",
  ipAddress: "192.168.1.100",
  userAgent: "Mozilla/5.0...",
  success: true,
  details: { ... }
}
```

### Audit Retention

```
Log Retention Policy:

├─ Hot Storage (MySQL):
│  └─ Last 90 days (query quickly)
│
├─ Warm Storage (Archive):
│  └─ 91 days - 1 year (slower access)
│
└─ Cold Storage (Backup):
   └─ Retained indefinitely (compliance)

Retention Duration by Event Type:

├─ Authentication: 1 year
├─ Authorization: 1 year
├─ Data Access (KMS): 7 years
├─ Security Events: 5 years
└─ Operational Logs: 90 days
```

---

## 💡 Best Practices

### Developers

```
1. NEVER commit secrets
   ├─ Use .env files (excluded in .gitignore)
   ├─ Use environment variables in CI/CD
   └─ Rotate secrets regularly

2. ALWAYS validate input
   ├─ Check type, length, format
   ├─ Sanitize output
   └─ Use frameworks' built-in validation

3. ALWAYS use HTTPS
   ├─ Force HTTPS redirect
   ├─ Enable HSTS
   └─ Use TLS 1.3+

4. ALWAYS update dependencies
   ├─ Run: npm audit regularly
   ├─ Update: npm update
   └─ Monitor: npm outdated

5. NEVER log sensitive data
   ├─ No passwords/tokens in logs
   ├─ No credit card numbers
   └─ No personal information (PII)
```

### Operations

```
1. Monitoring
   ├─ Alert on suspicious patterns
   ├─ Monitor failed authentications
   ├─ Track API usage anomalies
   └─ Monitor rate limit triggers

2. Incident Response
   ├─ Have incident response plan
   ├─ Know escalation procedures
   ├─ Practice incident scenarios
   └─ Document post-mortems

3. Access Management
   ├─ Principle of least privilege
   ├─ Regular access reviews
   ├─ Remove unused accounts
   └─ Audit privileged access

4. Backup & Recovery
   ├─ Test backups regularly
   ├─ Verify recovery procedures
   ├─ Encrypt backups
   └─ Store in different regions

5. Penetration Testing
   ├─ Annual external audit
   ├─ Monthly internal scans
   ├─ Fix findings within SLA
   └─ Document remediation
```

---

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07
