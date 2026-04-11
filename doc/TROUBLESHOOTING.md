# 🔧 Xử Lý Sự Cố - Hệ Thống Phát Nhạc

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07

---

## 📑 Mục Lục

1. [Sự Cố Phổ Biến](#sự-cố-phổ-biến)
2. [Xác Thực & Phân Quyền](#xác-thực--phân-quyền)
3. [Streaming & Phát Nhạc](#streaming--phát-nhạc)
4. [Database & Cache](#database--cache)
5. [Infrastructure & Deployment](#infrastructure--deployment)
6. [Performance Issues](#performance-issues)
7. [Security Issues](#security-issues)
8. [Tools & Commands](#tools--commands)

---

## 🚨 Sự Cố Phổ Biến

### 1. 401 Unauthorized - Token Hết Hạn

**Triệu Chứng:**

```
GET /api/v1/songs
Response: 401 Unauthorized
{
  "code": "AUTH_TOKEN_EXPIRED",
  "message": "Token đã hết hạn"
}
```

**Nguyên Nhân:**

- JWT token hết hạn (24 giờ)
- Token không được kèm trong request
- Token signature không hợp lệ

**Giải Pháp:**

```bash
# 1. Kiểm tra token trong localStorage
console.log(localStorage.getItem('accessToken'));

# 2. Kiểm tra expiration time
const decoded = jwt_decode(token);
console.log(new Date(decoded.exp * 1000));

# 3. Refresh token
curl -X POST https://api.yourdomain.com/api/v1/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken": "your_refresh_token"}'

# 4. Đăng nhập lại nếu refresh token hết hạn
curl -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'
```

**Phòng Ngừa:**

```javascript
// Auto-refresh token trước khi hết hạn
setInterval(
  () => {
    const token = localStorage.getItem("accessToken");
    const decoded = jwt_decode(token);
    const expiresIn = decoded.exp * 1000 - Date.now();

    // Refresh nếu còn < 5 phút
    if (expiresIn < 5 * 60 * 1000) {
      refreshToken();
    }
  },
  1 * 60 * 1000,
); // Check mỗi phút
```

---

### 2. 403 Forbidden - Device Binding Failed

**Triệu Chứng:**

```
GET /api/v1/stream/key/songId
Response: 403 Forbidden
{
  "code": "DEVICE_BINDING_FAILED",
  "message": "Thiết bị không khớp. Tài khoản bị khóa"
}
```

**Nguyên Nhân:**

- Dấu vân tay thiết bị không khớp
- Đăng nhập từ thiết bị mới
- Browser/User-Agent thay đổi
- Nhiều nỗ lực xác minh thất bại

**Giải Pháp:**

```bash
# 1. Kiểm tra device fingerprint
curl -s https://api.yourdomain.com/api/v1/auth/me \
  -H "Authorization: Bearer $JWT_TOKEN" \
  | jq '.data.deviceFingerprints'

# 2. Đăng xuất & đăng nhập lại từ thiết bị mới
curl -X POST https://api.yourdomain.com/api/v1/auth/logout \
  -H "Authorization: Bearer $JWT_TOKEN"

curl -X POST https://api.yourdomain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "your_username",
    "password": "your_password"
  }'

# 3. Nếu tài khoản bị khóa, chờ 1 giờ hoặc liên hệ admin
echo "Account locked. Please wait 1 hour or contact support."
```

**Phòng Ngừa:**

```javascript
// Clear device FP khi user thay đổi browser
if (navigator.userAgent !== localStorage.getItem("lastUserAgent")) {
  localStorage.clear();
  localStorage.setItem("lastUserAgent", navigator.userAgent);
  // Force re-login
  window.location.href = "/login";
}
```

---

### 3. 429 Too Many Requests - Rate Limited

**Triệu Chứng:**

```
Response: 429 Too Many Requests
{
  "code": "RATE_LIMIT_EXCEEDED",
  "message": "Vượt quá giới hạn yêu cầu",
  "retryAfter": 60
}

Headers:
Retry-After: 60
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1680854400
```

**Nguyên Nhân:**

- Quá nhiều requests trong khoảng thời gian ngắn
- Script/bot tự động gửi requests
- Client lỗi retry liên tục

**Giải Pháp:**

```bash
# 1. Chờ theo Retry-After header
RETRY_AFTER=$(curl -I https://api.yourdomain.com/api/v1/songs | grep "Retry-After")
echo "Chờ $RETRY_AFTER giây"

# 2. Implement exponential backoff
bash -c '
for i in {1..5}; do
  echo "Attempt $i..."
  curl https://api.yourdomain.com/api/v1/songs
  if [ $? -eq 0 ]; then
    break
  fi
  WAIT=$((2 ** (i-1)))
  echo "Chờ $WAIT giây..."
  sleep $WAIT
done
'

# 3. Kiểm tra rate limit headers
curl -I https://api.yourdomain.com/api/v1/songs | grep "X-RateLimit"
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 95
# X-RateLimit-Reset: 1680854400
```

**Phòng Ngừa:**

```javascript
// Implement request queue dengan delay
class RequestQueue {
  constructor(maxRequests = 10, windowMs = 60000) {
    this.maxRequests = maxRequests;
    this.windowMs = windowMs;
    this.requests = [];
  }

  async add(fn) {
    // Check rate limit
    const now = Date.now();
    this.requests = this.requests.filter((t) => now - t < this.windowMs);

    if (this.requests.length >= this.maxRequests) {
      const waitTime = this.requests[0] + this.windowMs - now;
      console.log(`Rate limited. Wait ${waitTime}ms`);
      await new Promise((r) => setTimeout(r, waitTime));
    }

    this.requests.push(now);
    return fn();
  }
}

// Usage
const queue = new RequestQueue();
await queue.add(() => fetch("/api/v1/songs"));
await queue.add(() => fetch("/api/v1/playlists"));
```

---

## 🔐 Xác Thực & Phân Quyền

### Sự Cố: Không Thể Đăng Nhập

**Vấn Đề:** Login luôn thất bại mặc dù mật khẩu đúng

**Debugging:**

```bash
# 1. Kiểm tra API có chạy không
curl -s http://localhost:3000/health | jq '.'

# 2. Kiểm tra database connection
curl -s http://localhost:3000/db/health | jq '.'

# 3. Test login endpoint trực tiếp
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "john_doe",
    "password": "password123"
  }' | jq '.'

# 4. Kiểm tra logs
docker logs music-api | grep -i "login\|auth\|error"

# 5. Kiểm tra user tồn tại trong database
mongo "mongodb://localhost:27017/music_streaming"
> db.users.findOne({ username: "john_doe" })

# 6. Kiểm tra bcrypt password hashing
npm run -s bash << 'EOF'
const bcrypt = require('bcryptjs');
const hashedFromDB = "$2b$12$...";
const plainPassword = "password123";
bcrypt.compare(plainPassword, hashedFromDB, (err, res) => {
  console.log(res ? "✅ Password matches" : "❌ Password mismatch");
});
EOF
```

---

### Sự Cố: Không Có Quyền Truy Cập (403)

**Vấn Đề:** 403 Forbidden khi truy cập admin endpoint

**Debugging:**

```bash
# 1. Kiểm tra role của user
curl -s http://localhost:3000/api/v1/users/me \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.data.role'
# Expected: "admin"

# 2. Kiểm tra JWT payload
node -e "
const jwt = require('jsonwebtoken');
const token = '$JWT_TOKEN';
const decoded = jwt.decode(token);
console.log(JSON.stringify(decoded, null, 2));
"

# 3. Xác minh endpoint protection
grep -r "@Admin\|@UseGuards.*AdminGuard" apps/api/src

# 4. Kiểm tra logs của service
docker logs music-api | grep -i "403\|forbidden\|permission"
```

---

## 🎵 Streaming & Phát Nhạc

### Sự Cố: Không Thể Phát Nhạc (Manifest 404)

**Triệu Chứng:**

```
GET /api/v1/stream/manifest/songId
Response: 404 Not Found
{
  "code": "SONG_NOT_FOUND",
  "message": "Bài hát không tồn tại"
}
```

**Debugging:**

```bash
# 1. Kiểm tra bài hát tồn tại trong database
mongo "mongodb://localhost:27017/music_streaming"
> db.songs.findOne({ _id: ObjectId("songId") })

# 2. Kiểm tra status của bài hát
> db.songs.findOne({ _id: ObjectId("songId") }, { status: 1 })
# Expected: { status: "ready" }

# 3. Kiểm tra HLS path
> db.songs.findOne(
  { _id: ObjectId("songId") },
  { hlsMasterPath: 1, bitrates: 1 }
)

# 4. Kiểm tra file tồn tại trong R2
aws s3 ls s3://music-content/songs/songId/

# 5. Kiểm tra API logs
docker logs music-api | grep -i "manifest\|streaming"
```

**Giải Pháp:**

```bash
# 1. Nếu song không tồn tại, upload lại
curl -X POST http://localhost:3000/api/v1/admin/upload \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -F "file=@song.mp3" \
  -F "title=Song Name"

# 2. Nếu status không phải "ready", chờ processing hoặc kiểm tra logs
mongo "mongodb://localhost:27017/music_streaming"
> db.songs.findOne(
  { _id: ObjectId("songId") },
  { status: 1, processingLog: 1 }
)

# 3. Nếu HLS path trống, trigger re-processing
# Update MongoDB để force re-transcode
> db.songs.updateOne(
  { _id: ObjectId("songId") },
  { $set: { status: "processing" } }
)
```

---

### Sự Cố: Không Thể Lấy Khóa Giải Mã (Key 403)

**Triệu Chứng:**

```
GET /api/v1/stream/key/songId
Response: 403 Forbidden
{
  "code": "DEVICE_BINDING_FAILED",
  "message": "Thiết bị không khớp"
}
```

**Debugging:**

```bash
# 1. Kiểm tra KMS service chạy
curl http://localhost:5000/health

# 2. Kiểm tra device fingerprint
curl -s "http://localhost:3000/api/v1/users/me?fields=deviceFingerprints" \
  -H "Authorization: Bearer $JWT_TOKEN"

# 3. So sánh device FP hiện tại vs lưu
echo "Device FP từ request: $DEVICE_FP"
echo "Device FP từ database: $(mongo ... | jq '.deviceFingerprints[0]')"

# 4. Kiểm tra KMS logs
docker logs music-kms | grep -i "device\|binding"

# 5. Kiểm tra failed attempts counter
redis-cli GET "failed_device_checks:userId"
```

**Giải Pháp:**

```bash
# 1. Reset device fingerprints
mongo "mongodb://localhost:27017/music_streaming"
> db.users.updateOne(
  { _id: ObjectId("userId") },
  { $set: { deviceFingerprints: [] } }
)

# 2. Đăng xuất & đăng nhập lại
curl -X POST http://localhost:3000/api/v1/auth/logout \
  -H "Authorization: Bearer $JWT_TOKEN"

# 3. Đăng nhập lại sẽ tạo device fingerprint mới
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "...","password": "..."}'

# 4. Reset failed counter nếu bị khóa
redis-cli DEL "failed_device_checks:userId"
redis-cli DEL "account_lock:userId"
```

---

## 💾 Database & Cache

### Sự Cố: MongoDB Connection Timeout

**Triệu Chứng:**

```
Error: connect ECONNREFUSED 127.0.0.1:27017
MongoError: Failed to connect to server
```

**Debugging:**

```bash
# 1. Kiểm tra MongoDB container chạy
docker ps | grep mongodb

# 2. Kiểm tra MongoDB port
docker port music-mongodb
# 27017/tcp -> 127.0.0.1:27017

# 3. Kiểm tra MongoDB logs
docker logs music-mongodb

# 4. Test connection
mongosh --uri "mongodb://localhost:27017"

# 5. Kiểm tra network
docker network inspect music-network
```

**Giải Pháp:**

```bash
# 1. Restart MongoDB
docker-compose restart mongodb

# 2. Kiểm tra health
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"

# 3. Nếu vẫn lỗi, xóa & tạo lại
docker-compose down
docker volume rm music-streaming_mongo-data
docker-compose up -d mongodb

# 4. Restore từ backup nếu cần
mongorestore --archive=backup.archive --gzip
```

---

### Sự Cố: Redis Connection Refused

**Triệu Chứng:**

```
Error: connect ECONNREFUSED 127.0.0.1:6379
Error: NOAUTH Authentication required
```

**Debugging:**

```bash
# 1. Kiểm tra Redis container
docker ps | grep redis

# 2. Test Redis connection
redis-cli -h 127.0.0.1 -p 6379 PING
# Expected: PONG

# 3. Kiểm tra Redis logs
docker logs music-redis

# 4. Kiểm tra Redis config
redis-cli CONFIG GET "*"

# 5. Kiểm tra memory usage
redis-cli INFO memory
```

**Giải Pháp:**

```bash
# 1. Nếu Redis down, restart
docker-compose restart redis

# 2. Nếu auth fail, check password
redis-cli -a password PING

# 3. Nếu memory full, clear cache
redis-cli FLUSHDB  # Xóa database hiện tại
redis-cli FLUSHALL  # Xóa tất cả databases

# 4. Monitor Redis real-time
redis-cli MONITOR

# 5. Check specific keys
redis-cli KEYS "*"
redis-cli KEYS "session:*"
redis-cli TTL "key_name"
```

---

## ☁️ Infrastructure & Deployment

### Sự Cố: Pod CrashLoopBackOff

**Triệu Chứng:**

```
kubectl get pods
NAME                    READY   STATUS             RESTARTS
api-deployment-abc123   0/1     CrashLoopBackOff   5
```

**Debugging:**

```bash
# 1. Kiểm tra pod logs
kubectl logs pod/api-deployment-abc123
# Xem error message

# 2. Kiểm tra describe pod
kubectl describe pod api-deployment-abc123

# 3. Kiểm tra liveness probe
kubectl get pod api-deployment-abc123 -o yaml | grep -A 5 "livenessProbe"

# 4. Kiểm tra previous logs (nếu pod restart)
kubectl logs pod/api-deployment-abc123 --previous

# 5. Check events
kubectl get events --sort-by='.lastTimestamp'
```

**Giải Pháp:**

```bash
# 1. Kiểm tra image
kubectl describe deployment api-deployment | grep -i "image"

# 2. Pull latest image
docker pull $ECR_URL/api:latest

# 3. Force pod restart
kubectl rollout restart deployment/api-deployment

# 4. Check resource limits
kubectl describe node

# 5. Increase resource limits nếu OOMKilled
kubectl set resources deployment api-deployment \
  --requests=cpu=250m,memory=512Mi \
  --limits=cpu=500m,memory=1Gi
```

---

### Sự Cố: High CPU/Memory Usage

**Triệu Chứng:**

```
kubectl top nodes
NAME       CPU(cores)  MEMORY(Mi)
node-1     2500m       7500Mi  (Quá cao)

kubectl top pods
NAME                     CPU(m)   MEMORY(Mi)
api-deployment-abc123    800m     1000Mi  (Quá cao)
```

**Debugging:**

```bash
# 1. Xác định pod chiếm tài nguyên nhiều
kubectl top pods --all-namespaces --sort-by=memory

# 2. Kiểm tra logs của pod
kubectl logs pod-name --tail=100 | grep -i "memory\|cpu"

# 3. Kiểm tra running processes
kubectl exec pod-name -- ps aux

# 4. Memory profiling
kubectl exec pod-name -- node --inspect

# 5. Kiểm tra lỗi trong code
kubectl exec pod-name -- tail -100 /var/log/app.log
```

**Giải Pháp:**

```bash
# 1. Nếu memory leak, restart pod
kubectl delete pod pod-name

# 2. Giảm logging verbosity
kubectl set env deployment/api-deployment LOG_LEVEL=info

# 3. Increase resource limits
kubectl set resources deployment/api-deployment \
  --limits=memory=2Gi,cpu=1000m

# 4. Enable HPA (auto-scaling)
kubectl apply -f devops/kubernetes/api-hpa.yml

# 5. Profile & optimize code
# Chạy heap snapshot, timeline analysis
```

---

## 📊 Performance Issues

### Sự Cố: Slow API Response

**Triệu Chứng:**

```
Response time: > 1 second
API latency trending upwards in Grafana
```

**Debugging:**

```bash
# 1. Kiểm tra API response time
curl -w "Response time: %{time_total}s\n" \
  http://localhost:3000/api/v1/songs

# 2. Kiểm tra database query time
mongo "mongodb://localhost:27017/music_streaming"
> db.setProfilingLevel(1)  // Profile slow queries
> db.system.profile.find().pretty().limit(10)

# 3. Kiểm tra MongoDB indexes
> db.songs.getIndexes()

# 4. Kiểm tra network latency
ping api.yourdomain.com
mtr api.yourdomain.com  # Multi-threaded traceroute

# 5. Kiểm tra CPU/Memory
kubectl top pods
docker stats
```

**Giải Pháp:**

```bash
# 1. Thêm database indexes
mongo "mongodb://localhost:27017/music_streaming"
> db.songs.createIndex({ title: "text", artistId: 1 })

# 2. Enable caching
# Thêm @Cache(5) decorator ở endpoint

# 3. Optimize queries
# Ví dụ: projection để lấy ít fields hơn
db.songs.find({ }, { title: 1, artist: 1 })

# 4. Add CDN cache
# Cloudflare cache settings

# 5. Scale horizontally
kubectl scale deployment/api-deployment --replicas=10
```

---

## 🔐 Security Issues

### Sự Cố: XSS Vulnerability

**Triệu Chứng:**

```
<script>alert('XSS')</script> được execute trong browser
```

**Kiểm Tra & Sửa:**

```bash
# 1. Scan repository cho input validation
grep -r "innerHTML\|dangerouslySetInnerHTML" apps/web/src/

# 2. Kiểm tra CSP headers
curl -I http://localhost:3000 | grep "Content-Security-Policy"

# 3. Escape output
# React tự động escape, nhưng kiểm tra:
// ❌ Bad
<div dangerouslySetInnerHTML={{__html: userInput}} />

// ✅ Good
<div>{userInput}</div>  // React tự động escape

# 4. Sanitize input
npm install dompurify
import DOMPurify from 'dompurify';
const safe = DOMPurify.sanitize(userInput);
```

---

### Sự Cố: SQL Injection

**Kiểm Tra:**

```bash
# 1. Tìm raw SQL queries
grep -r "query\|execute" apps/api/src --include="*.ts" | grep -v "parameterized"

# 2. Kiểm tra các endpoint dễ bị tấn công
grep -r "userId\|id.*req.body" apps/api/src

# 3. Test injection
curl "http://localhost:3000/api/v1/songs?search='; DROP TABLE songs; --"
# Nếu database bị ảnh hưởng, có SQL injection
```

**Sửa:**

```typescript
// ❌ Bad (Vulnerable)
const query = `SELECT * FROM users WHERE id = ${userId}`;
db.query(query);

// ✅ Good (Safe)
const query = `SELECT * FROM users WHERE id = ?`;
db.query(query, [userId]);

// ✅ Best (Using ORM)
User.findById(userId);
```

---

## 🛠️ Tools & Commands

### Useful Debugging Commands

```bash
# ========== DOCKER ==========
# View logs
docker logs -f container_name
docker logs --tail 100 container_name
docker logs --since 10m container_name

# Enter container shell
docker exec -it container_name bash
docker exec -it container_name mongosh

# Check resource usage
docker stats
docker stats container_name

# Network diagnostics
docker network ls
docker network inspect network_name

# ========== KUBERNETES ==========
# Get resources
kubectl get pods
kubectl get svc
kubectl get deployments
kubectl get nodes
kubectl get events

# Describe resources
kubectl describe pod pod_name
kubectl describe node node_name
kubectl describe deployment deployment_name

# View logs
kubectl logs pod_name
kubectl logs -f deployment_name
kubectl logs pod_name --previous  # Previous logs
kubectl logs pod_name -c container_name  # Specific container

# Execute commands
kubectl exec pod_name -- command
kubectl exec -it pod_name -- bash
kubectl exec pod_name -- curl http://localhost:3000

# Port forwarding
kubectl port-forward pod_name 3000:3000
kubectl port-forward service_name 3000:3000

# ========== MONGODB ==========
# Connect
mongosh "mongodb://localhost:27017"
mongosh "mongodb+srv://user:pass@cluster.mongodb.net"

# Database operations
show dbs
use database_name
show collections

# Query
db.collection.find()
db.collection.findOne({ _id: ObjectId("...") })
db.collection.find().explain("executionStats")

# Aggregate
db.collection.aggregate([
  { $match: { field: value } },
  { $group: { _id: "$category", count: { $sum: 1 } } }
])

# ========== REDIS ==========
# Connect
redis-cli
redis-cli -h host -p port

# Commands
PING
INFO
KEYS *
GET key
SET key value
DEL key
EXPIRE key seconds
TTL key
FLUSHDB
FLUSHALL

# Monitoring
MONITOR
SLOWLOG GET
SLOWLOG LEN

# ========== CURL ==========
# Basic request
curl http://localhost:3000/api/v1/songs

# With headers
curl -H "Authorization: Bearer token" http://localhost:3000/...

# POST request
curl -X POST http://localhost:3000/... \
  -H "Content-Type: application/json" \
  -d '{"key":"value"}'

# Upload file
curl -F "file=@filepath" http://localhost:3000/...

# Show headers
curl -i http://localhost:3000/...

# Follow redirects
curl -L http://localhost:3000/...

# Measure time
curl -w "Total: %{time_total}s\n" http://localhost:3000/...

# ========== GIT ==========
# View recent changes
git log --oneline -10
git log --author="name" --oneline

# Show diff
git diff
git diff branch1 branch2

# Rollback
git revert commit_hash
git reset --hard commit_hash

# ========== NPM ==========
# Check outdated packages
npm outdated
npm audit

# Fix vulnerabilities
npm audit fix
npm audit fix --force

# Clean cache
npm cache clean --force

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

---

## 📞 Liên Hệ & Support

### Escalation Path

```
Issue → Check Documentation → Check Logs → Contact Team

1. First Check
   ├─ Documentation (API docs, README)
   ├─ Logs (local or cloud)
   └─ Stack Overflow / GitHub Issues

2. Team Escalation
   ├─ Team Slack channel
   ├─ GitHub Issues
   └─ Email support@yourdomain.com

3. Emergency
   ├─ Page on-call engineer
   ├─ PagerDuty
   └─ Call emergency number
```

---

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07  
**Last Updated:** 2026-04-07
