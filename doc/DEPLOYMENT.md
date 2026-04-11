# 🚀 Hướng Dẫn Triển Khai - Hệ Thống Phát Nhạc

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07

---

## 📑 Mục Lục

1. [Tổng Quan Triển Khai](#tổng-quan-triển-khai)
2. [Yêu Cầu Trước Triển Khai](#yêu-cầu-trước-triển-khai)
3. [Triển Khai Phát Triển (Development)](#triển-khai-phát-triển-development)
4. [Triển Khai Dàn Dựng (Staging)](#triển-khai-dàn-dựng-staging)
5. [Triển Khai Sản Xuất (Production)](#triển-khai-sản-xuất-production)
6. [CI/CD Pipeline](#cicd-pipeline)
7. [Monitoring & Logging](#monitoring--logging)
8. [Scaling & Performance](#scaling--performance)
9. [Disaster Recovery](#disaster-recovery)
10. [Rollback Procedures](#rollback-procedures)

---

## 🎯 Tổng Quan Triển Khai

### Các Môi Trường

```
┌─────────────────────────────────────────┐
│ Development (Dev)                       │
│ ├─ Local machine hoặc Dev server       │
│ ├─ PostgreSQL local                     │
│ ├─ Redis local                          │
│ └─ AWS/GCP Dev account                  │
└─────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Staging (Stg)                           │
│ ├─ Test trước Production                │
│ ├─ Data từ Production (sanitized)       │
│ ├─ MongoDB Atlas Staging                │
│ ├─ Redis Cluster                        │
│ └─ Full AWS/GCP Staging infrastructure  │
└─────────────────────────────────────────┘
               │
               ▼
┌─────────────────────────────────────────┐
│ Production (Prod)                       │
│ ├─ Live users                           │
│ ├─ MongoDB Atlas Production              │
│ ├─ Redis Cluster (3+ replicas)          │
│ ├─ AWS/GCP Production infrastructure    │
│ ├─ Cloudflare CDN                       │
│ ├─ Auto-scaling enabled                 │
│ └─ Full monitoring & alerts             │
└─────────────────────────────────────────┘
```

---

## 📋 Yêu Cầu Trước Triển Khai

### Checklist Trước Triển Khai

```
☐ Code Review
  ├─ Code được review bởi >= 2 người
  ├─ Không có merge conflict
  ├─ Linting checks pass
  └─ Security scanning pass

☐ Testing
  ├─ Unit tests: Pass (coverage > 80%)
  ├─ Integration tests: Pass
  ├─ E2E tests: Pass
  └─ Load tests: Pass (ngưỡng OK)

☐ Documentation
  ├─ README cập nhật
  ├─ API docs cập nhật
  ├─ Database schema cập nhật
  └─ Change log cập nhật

☐ Security
  ├─ SAST scan pass (no high severity)
  ├─ Dependency check pass
  ├─ Secret scan pass (no secrets in code)
  └─ Security review done

☐ Database
  ├─ Migrations ready
  ├─ Migrations tested
  ├─ Backup plan in place
  └─ Rollback plan in place

☐ Infrastructure
  ├─ Resources capacity OK
  ├─ Load balancer ready
  ├─ SSL certificates valid
  ├─ DNS records updated
  └─ Monitoring configured

☐ Communication
  ├─ Deployment window scheduled
  ├─ Team notified
  ├─ On-call engineers assigned
  └─ Stakeholders informed
```

---

## 💻 Triển Khai Phát Triển (Development)

### Bước 1: Chuẩn Bị Môi Trường

```bash
# 1. Clone repository
git clone https://github.com/yourusername/music-streaming-hls.git
cd music-streaming-hls

# 2. Checkout development branch
git checkout develop

# 3. Cài đặt dependencies
pnpm install

# 4. Cài đặt pre-commit hooks
pnpm husky install

# 5. Tạo .env files
cp .env.example .env
cp apps/api/.env.example apps/api/.env
cp apps/kms/.env.example apps/kms/.env
cp apps/web/.env.example apps/web/.env.local

# 6. Cập nhật .env cho dev
cat >> .env << EOF
NODE_ENV=development
DEBUG=true
LOG_LEVEL=debug
EOF
```

### Bước 2: Khởi Động Docker Compose

```bash
# 1. Xây dựng images
docker-compose -f docker-compose.dev.yml build

# 2. Khởi động services
docker-compose -f docker-compose.dev.yml up -d

# 3. Kiểm tra status
docker-compose ps

# Output:
# NAME                    STATUS
# music-mongodb           Up (healthy)
# music-mongo-express     Up
# music-mysql             Up (healthy)
# music-phpmyadmin        Up
# music-redis             Up (healthy)
# music-redis-commander   Up
# music-mailhog           Up

# 4. Kiểm tra kết nối
docker-compose exec mongodb mongosh --eval "db.adminCommand('ping')"
docker-compose exec mysql mysql -u music_user -p -e "SELECT 1"
docker-compose exec redis redis-cli PING
```

### Bước 3: Khởi Động Development Servers

```bash
# Terminal 1: Backend API
cd apps/api
npm run dev
# Output: [Nest] 12345  - 04/07/2026, 10:00:00 AM   LOG [NestFactory] Nest application successfully started +2ms

# Terminal 2: KMS Service
cd apps/kms
npm run dev
# Output: [Nest] 12346  - 04/07/2026, 10:00:05 AM   LOG [NestFactory] Nest application successfully started +2ms

# Terminal 3: Frontend
cd apps/web
npm run dev
# Output: ▲ Next.js 14.0.0
#         - Local: http://localhost:3001

# Terminal 4: Transcoding Worker
cd tools/transcoding-worker
npm run dev
# Output: [Nest] 12347  - 04/07/2026, 10:00:10 AM   LOG Worker started listening on port 5000
```

### Bước 4: Kiểm Tra Sức Khỏe

```bash
# Health checks
curl http://localhost:3000/health
# {"status":"ok","uptime":123,"version":"2.0.0"}

curl http://localhost:3001
# 200 OK (Next.js homepage)

curl http://localhost:5000/health
# {"status":"ok","service":"transcoding-worker"}

# Database connections
curl http://localhost:8081
# MongoDB Express UI

curl http://localhost:8080
# PhpMyAdmin UI

curl http://localhost:8082
# Redis Commander UI
```

---

## 🧪 Triển Khai Dàn Dựng (Staging)

### Kiến Trúc Staging

```
┌─────────────────────────────────────┐
│ Staging Environment (AWS EKS)       │
├─────────────────────────────────────┤
│ Namespace: music-streaming-staging  │
│                                     │
│ API Pods: 2 replicas               │
│ KMS Pods: 1 replica                │
│ Worker Pods: 2 replicas            │
│                                     │
│ MongoDB Atlas: Staging cluster      │
│ Redis: 3 nodes (no replication)    │
│                                     │
│ Storage: S3 (same as prod, diff key)
│ CDN: Cloudflare                     │
└─────────────────────────────────────┘
```

### Bước 1: Chuẩn Bị Staging

```bash
# 1. Login vào AWS
aws configure
# Enter: AWS Access Key ID, Secret Access Key, Region

# 2. Login vào Docker Registry
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin 123456789012.dkr.ecr.us-east-1.amazonaws.com

# 3. Tạo namespaces
kubectl create namespace music-streaming-staging
kubectl create namespace monitoring

# 4. Tạo secrets
kubectl create secret generic aws-credentials \
  --from-literal=access-key=$AWS_ACCESS_KEY \
  --from-literal=secret-key=$AWS_SECRET_KEY \
  -n music-streaming-staging

kubectl create secret generic mongodb-credentials \
  --from-literal=connection-string=$MONGODB_URI_STAGING \
  -n music-streaming-staging

kubectl create secret generic kms-credentials \
  --from-literal=mysql-password=$MYSQL_PASSWORD \
  -n music-streaming-staging
```

### Bước 2: Build & Push Images

```bash
# 1. Build Docker images
docker build -t music-streaming-api:staging-1.0.0 -f tools/docker/Dockerfile.api .
docker build -t music-streaming-kms:staging-1.0.0 -f tools/docker/Dockerfile.kms .
docker build -t music-streaming-worker:staging-1.0.0 -f tools/docker/Dockerfile.worker .

# 2. Tag images
docker tag music-streaming-api:staging-1.0.0 \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/music-streaming-api:staging-1.0.0

# 3. Push lên ECR
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/music-streaming-api:staging-1.0.0
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/music-streaming-kms:staging-1.0.0
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/music-streaming-worker:staging-1.0.0
```

### Bước 3: Deploy lên Kubernetes

```bash
# 1. Apply Kubernetes manifests
kubectl apply -f devops/kubernetes/staging/
# configmap "api-config" created
# secret "api-secret" created
# deployment "api-deployment" created
# service "api-service" created
# etc...

# 2. Kiểm tra pods
kubectl get pods -n music-streaming-staging
# NAME                            READY   STATUS    RESTARTS   AGE
# api-deployment-abc123-xyz789    1/1     Running   0          30s
# kms-deployment-def456-uvw012    1/1     Running   0          30s
# worker-deployment-ghi789-rst345 1/1     Running   0          30s

# 3. Kiểm tra services
kubectl get svc -n music-streaming-staging
# NAME      TYPE      CLUSTER-IP     EXTERNAL-IP      PORT(S)
# api       LoadBal   10.0.1.100     a1b2c3d4.us-...  80:30123/TCP
# kms       ClusterIP 10.0.1.101     <none>           5000/TCP

# 4. Kiểm tra logs
kubectl logs -f deployment/api-deployment -n music-streaming-staging
kubectl logs -f deployment/kms-deployment -n music-streaming-staging
```

### Bước 4: Database Migrations

```bash
# 1. Connect vào MongoDB Staging
mongosh "mongodb+srv://user:pass@staging.mongodb.net/music_streaming_staging"

# 2. Run migrations
db.songs.createIndex({ checksum: 1 }, { unique: true });
db.songs.createIndex({ title: "text", artistId: 1 });
db.play_history.createIndex(
  { playedAt: 1 },
  { expireAfterSeconds: 31536000 }
);

# 3. Verify indexes
db.songs.getIndexes();

# 4. Test queries
db.songs.findOne({ title: { $regex: "test" } });
```

### Bước 5: Health & Smoke Tests

```bash
#!/bin/bash
# scripts/staging-smoke-tests.sh

echo "🔍 Running Staging Smoke Tests..."

STAGING_URL="https://api-staging.yourdomain.com"

# 1. API health check
echo "1️⃣ API Health Check..."
curl -s $STAGING_URL/health | jq '.status'
# Expected: "ok"

# 2. Signup
echo "2️⃣ User Signup..."
curl -X POST $STAGING_URL/api/v1/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "username": "test_user",
    "email": "test@staging.example.com",
    "password": "TestPassword123!",
    "displayName": "Test User"
  }' | jq '.success'
# Expected: true

# 3. List songs
echo "3️⃣ List Songs..."
curl -X GET "$STAGING_URL/api/v1/songs?limit=10" \
  -H "Authorization: Bearer $JWT_TOKEN" | jq '.data | length'
# Expected: >= 0

# 4. Check database
echo "4️⃣ Database Status..."
curl -s http://localhost:8081/api/servers/default/db \
  | jq '.auth'
# Expected: true

echo "✅ Staging Smoke Tests Completed!"
```

---

## 🌐 Triển Khai Sản Xuất (Production)

### Kiến Trúc Production

```
┌──────────────────────────────────────────────┐
│ Production Environment (Multi-Region AWS)    │
├──────────────────────────────────────────────┤
│ Regions:                                     │
│ ├─ us-east-1 (Primary)                      │
│ ├─ us-west-2 (Secondary)                    │
│ └─ eu-west-1 (Europe)                       │
│                                              │
│ Primary Region (us-east-1):                 │
│ ├─ EKS Cluster: music-streaming-prod       │
│ ├─ Nodes: 5-20 (auto-scaling)              │
│ ├─ API Pods: 5 replicas (minimum)          │
│ ├─ KMS Pods: 3 replicas                    │
│ ├─ Worker Pods: 10 replicas                │
│                                              │
│ Managed Services:                            │
│ ├─ MongoDB Atlas: 3-node replica set       │
│ │  ├─ us-east-1 (Primary)                  │
│ │  ├─ us-west-2 (Secondary)                │
│ │  └─ eu-west-1 (Secondary)                │
│ ├─ RDS MySQL: Multi-AZ                     │
│ ├─ ElastiCache Redis: 3-node cluster       │
│ ├─ S3: Multi-region replication            │
│ └─ CloudFront: Global CDN                  │
│                                              │
│ Supporting:                                  │
│ ├─ ALB (Application Load Balancer)          │
│ ├─ WAF (Web Application Firewall)           │
│ ├─ CloudWatch (Monitoring)                  │
│ ├─ Prometheus + Grafana                     │
│ ├─ Sentry (Error Tracking)                  │
│ ├─ ELK Stack (Centralized Logging)          │
│ └─ PagerDuty (Incident Management)          │
│                                              │
│ Cloudflare:                                  │
│ ├─ Workers (Edge processing)                │
│ ├─ R2 (Object storage - 0$ egress)         │
│ ├─ WAF (DDoS protection)                    │
│ ├─ Cache Rules (Performance)                │
│ └─ Page Rules (Caching strategy)            │
└──────────────────────────────────────────────┘
```

### Bước 1: Pre-Production Checklist

```bash
#!/bin/bash
# scripts/pre-prod-checklist.sh

echo "📋 Production Pre-Deployment Checklist"

# 1. Verify branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "❌ Must deploy from 'main' branch. Current: $CURRENT_BRANCH"
  exit 1
fi
echo "✅ Correct branch (main)"

# 2. Verify all tests pass
echo "🧪 Running tests..."
npm run test -- --coverage
if [ $? -ne 0 ]; then
  echo "❌ Tests failed!"
  exit 1
fi
echo "✅ All tests pass"

# 3. Verify no uncommitted changes
if [ -n "$(git status --porcelain)" ]; then
  echo "❌ Uncommitted changes detected!"
  git status --porcelain
  exit 1
fi
echo "✅ No uncommitted changes"

# 4. Verify build succeeds
npm run build
if [ $? -ne 0 ]; then
  echo "❌ Build failed!"
  exit 1
fi
echo "✅ Build successful"

# 5. Verify database backups
echo "💾 Checking backups..."
aws s3 ls s3://music-streaming-backups/latest/ | grep $(date +%Y-%m-%d)
if [ $? -ne 0 ]; then
  echo "❌ No recent backup found!"
  exit 1
fi
echo "✅ Recent backup exists"

echo ""
echo "✅ All pre-deployment checks passed!"
echo "Ready for production deployment."
```

### Bước 2: Production Deployment

```bash
#!/bin/bash
# scripts/deploy-prod.sh

set -e

echo "🚀 Starting Production Deployment"
echo "Deployment time: $(date)"

# 1. Build images
echo "1️⃣ Building Docker images..."
docker build -t music-streaming-api:prod-$(date +%s) \
  -f tools/docker/Dockerfile.api .

# 2. Push to ECR
echo "2️⃣ Pushing to ECR..."
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_URL
docker push $ECR_URL/music-streaming-api:prod-$TIMESTAMP

# 3. Update Kubernetes manifests
echo "3️⃣ Updating Kubernetes manifests..."
kubectl set image deployment/api-deployment \
  api=$ECR_URL/music-streaming-api:prod-$TIMESTAMP \
  -n music-streaming-prod

# 4. Wait for rollout
echo "4️⃣ Waiting for rollout to complete..."
kubectl rollout status deployment/api-deployment \
  -n music-streaming-prod --timeout=5m

# 5. Run smoke tests
echo "5️⃣ Running smoke tests..."
bash scripts/smoke-tests.sh

# 6. Verify metrics
echo "6️⃣ Verifying metrics..."
kubectl top nodes
kubectl top pods -n music-streaming-prod

echo ""
echo "✅ Production deployment completed successfully!"
```

---

## 🔄 CI/CD Pipeline

### GitHub Actions Workflow

```yaml
# .github/workflows/deploy-production.yml

name: Deploy to Production

on:
  push:
    branches: [main]
    paths:
      - "apps/**"
      - "packages/**"
      - "tools/**"
      - "devops/**"
      - ".github/workflows/deploy-production.yml"

jobs:
  tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Run linter
        run: pnpm run lint

      - name: Run tests
        run: pnpm run test:ci

      - name: Run security scan
        run: npm audit --audit-level=moderate

  build:
    needs: tests
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - name: Login to ECR
        run: |
          aws ecr get-login-password --region us-east-1 | \
            docker login --username AWS --password-stdin ${{ secrets.ECR_URL }}

      - name: Build API image
        run: |
          docker build -t ${{ secrets.ECR_URL }}/api:${{ github.sha }} \
            -f tools/docker/Dockerfile.api .

      - name: Push API image
        run: docker push ${{ secrets.ECR_URL }}/api:${{ github.sha }}

  deploy:
    needs: build
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3

      - name: Configure kubectl
        run: |
          aws eks update-kubeconfig --name music-streaming-prod \
            --region us-east-1

      - name: Deploy to Kubernetes
        run: |
          kubectl set image deployment/api \
            api=${{ secrets.ECR_URL }}/api:${{ github.sha }} \
            -n music-streaming-prod

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/api \
            -n music-streaming-prod --timeout=5m

      - name: Run smoke tests
        run: |
          curl -f https://api.yourdomain.com/health

      - name: Notify Slack
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ Production deployment successful",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Production Deployment*\n${{ github.actor }} deployed ${{ github.sha }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 📊 Monitoring & Logging

### Prometheus + Grafana Setup

```bash
# 1. Deploy Prometheus
kubectl apply -f devops/kubernetes/monitoring/prometheus-deployment.yml
kubectl apply -f devops/kubernetes/monitoring/prometheus-service.yml

# 2. Deploy Grafana
kubectl apply -f devops/kubernetes/monitoring/grafana-deployment.yml
kubectl apply -f devops/kubernetes/monitoring/grafana-service.yml

# 3. Access Grafana
kubectl port-forward svc/grafana 3000:3000 -n monitoring
# http://localhost:3000
# Default: admin/admin

# 4. Create dashboards
# - API Performance
# - KMS Metrics
# - Worker Queue
# - Database Performance
# - Infrastructure Metrics
```

### CloudWatch Alarms

```bash
# High API Latency
aws cloudwatch put-metric-alarm \
  --alarm-name "High-API-Latency" \
  --alarm-description "API P95 latency > 500ms" \
  --metric-name "HTTPLatency" \
  --namespace "AWS/ApplicationELB" \
  --statistic "p95" \
  --period 300 \
  --threshold 500 \
  --comparison-operator "GreaterThanThreshold" \
  --alarm-actions $SNS_TOPIC_ARN

# High CPU Utilization
aws cloudwatch put-metric-alarm \
  --alarm-name "High-CPU-Utilization" \
  --metric-name "CPUUtilization" \
  --namespace "AWS/EC2" \
  --statistic "Average" \
  --period 300 \
  --threshold 80 \
  --comparison-operator "GreaterThanThreshold" \
  --alarm-actions $SNS_TOPIC_ARN
```

---

## 📈 Scaling & Performance

### Auto-Scaling Configuration

```yaml
# devops/kubernetes/api-hpa.yml
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: api-hpa
  namespace: music-streaming-prod
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: api-deployment

  minReplicas: 5
  maxReplicas: 20

  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70

    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80

  behavior:
    scaleUp:
      stabilizationWindowSeconds: 60
      policies:
        - type: Percent
          value: 100
          periodSeconds: 60

    scaleDown:
      stabilizationWindowSeconds: 300
      policies:
        - type: Percent
          value: 50
          periodSeconds: 60
```

---

## 🆘 Disaster Recovery

### Backup Procedure

```bash
#!/bin/bash
# scripts/backup-production.sh

echo "💾 Backing up production data..."

BACKUP_DATE=$(date +%Y-%m-%d-%H-%M-%S)

# 1. MongoDB backup
mongodump --uri="$MONGODB_PROD_URI" \
  --archive="s3://music-streaming-backups/mongodb/$BACKUP_DATE.archive" \
  --gzip

# 2. MySQL backup
mysqldump -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD \
  music_streaming > "s3://music-streaming-backups/mysql/$BACKUP_DATE.sql"

# 3. Verify backups
echo "✅ Backup completed: $BACKUP_DATE"
aws s3 ls s3://music-streaming-backups/
```

### Restore Procedure

```bash
#!/bin/bash
# scripts/restore-production.sh

RESTORE_DATE=$1  # e.g., 2026-04-07-10-00-00

echo "🔄 Restoring production data from $RESTORE_DATE..."

# 1. Restore MongoDB
mongorestore --uri="$MONGODB_PROD_URI" \
  --archive="s3://music-streaming-backups/mongodb/$RESTORE_DATE.archive" \
  --gzip \
  --drop

# 2. Restore MySQL
mysql -h $MYSQL_HOST -u $MYSQL_USER -p$MYSQL_PASSWORD \
  music_streaming < "s3://music-streaming-backups/mysql/$RESTORE_DATE.sql"

echo "✅ Restore completed"
```

---

## ↩️ Rollback Procedures

### Kubernetes Rollback

```bash
# 1. View rollout history
kubectl rollout history deployment/api-deployment -n music-streaming-prod
# REVISION  CHANGE-CAUSE
# 1         Initial deployment
# 2         Update image to v1.0.1
# 3         Update image to v1.0.2 (current - FAILED)

# 2. Rollback to previous version
kubectl rollout undo deployment/api-deployment \
  -n music-streaming-prod

# 3. Rollback to specific revision
kubectl rollout undo deployment/api-deployment \
  --to-revision=2 \
  -n music-streaming-prod

# 4. Verify rollback
kubectl rollout status deployment/api-deployment \
  -n music-streaming-prod

# 5. Check running pods
kubectl get pods -n music-streaming-prod
```

### Database Rollback

```bash
# 1. List available backups
aws s3 ls s3://music-streaming-backups/mongodb/

# 2. Restore from backup
mongorestore --uri="$MONGODB_PROD_URI" \
  --archive="s3://music-streaming-backups/mongodb/2026-04-07-09-00-00.archive" \
  --gzip \
  --drop \
  --noDump

# 3. Verify data integrity
db.songs.count()
db.users.count()
```

---

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-08
