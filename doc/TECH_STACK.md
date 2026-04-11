# 🛠️ Công Nghệ & Stack - Hệ Thống Phát Nhạc

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07

---

## 📑 Mục Lục

1. [Overview Tech Stack](#overview-tech-stack)
2. [Frontend Stack](#frontend-stack)
3. [Backend Stack](#backend-stack)
4. [KMS Microservice Stack](#kms-microservice-stack)
5. [Database & Cache](#database--cache)
6. [Infrastructure & Cloud](#infrastructure--cloud)
7. [DevOps & Tools](#devops--tools)
8. [Monitoring & Observability](#monitoring--observability)
9. [Security & Compliance](#security--compliance)
10. [Dependencies & Versions](#dependencies--versions)

---

## 🎯 Overview Tech Stack

### Tổng Quan

```
┌───────────────────────────────────────────────────────────┐
│                  MUSIC STREAMING HLS                      │
│                  Technology Stack v2.0                    │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  FRONTEND LAYER                                           │
│  ├─ Next.js 14 (React 18)                                 │
│  ├─ TypeScript                                            │
│  ├─ Tailwind CSS                                          │
│  ├─ Zustand (State Management)                            │
│  └─ Hls.js (HLS Player)                                   │
│                                                           │
│  API GATEWAY LAYER                                        │
│  ├─ NestJS (Node.js Framework)                            │
│  ├─ TypeScript                                            │
│  ├─ MongoDB (Metadata)                                    │
│  ├─ Redis (Cache)                                         │
│  └─ BullMQ (Job Queue)                                    │
│                                                           │
│  MICROSERVICES LAYER                                      │
│  ├─ KMS (gRPC Server)                                     │
│  │  ├─ Node.js + Crypto API                               │
│  │  ├─ MySQL (Key Storage)                                │
│  │  └─ mTLS Communication                                 │
│  │                                                        │
│  └─ Transcoding Worker                                    │
│     ├─ FFmpeg                                             │
│     ├─ Sharp (Image Processing)                           │
│     └─ BullMQ Consumer                                    │
│                                                           │
│  DATA LAYER                                               │
│  ├─ MongoDB Atlas (3-replica)                             │
│  ├─ MySQL/RDS (KMS & Audit)                               │
│  ├─ Redis Cluster                                         │
│  └─ S3/R2 (Media Storage)                                 │
│                                                           │
│  INFRASTRUCTURE LAYER                                     │
│  ├─ AWS EKS (Kubernetes)                                  │ 
│  ├─ Docker & Container                                    │
│  ├─ Terraform (IaC)                                       │
│  ├─ Helm (K8s Package Manager)                            │
│  └─ CloudFlare (CDN & Edge)                               │
│                                                           │
│  OBSERVABILITY LAYER                                      │
│  ├─ Prometheus (Metrics)                                  │
│  ├─ Grafana (Visualization)                               │
│  ├─ ELK Stack (Logging)                                   │
│  ├─ Sentry (Error Tracking)                               │
│  └─ CloudWatch (AWS Monitoring)                           │
│                                                           │
│  CI/CD LAYER                                              │
│  ├─ GitHub Actions (Automation)                           │
│  ├─ SonarQube (Code Quality)                              │
│  ├─ Docker Registry (ECR)                                 │
│  └─ ArgoCD (GitOps)                                       │
│                                                           │
└───────────────────────────────────────────────────────────┘
```

---

## 💻 Frontend Stack

### Core Technologies

| Công Nghệ         | Phiên Bản | Mục Đích        | Lý Do Chọn                         |
| :---------------- | :-------- | :-------------- | :--------------------------------- |
| **Next.js**       | 14.x      | React framework | SSR, SSG, API routes, performance  |
| **React**         | 18.x      | UI Library      | Component-based, hooks, ecosystem  |
| **TypeScript**    | 5.x       | Type safety     | Developer experience, fewer bugs   |
| **Tailwind CSS**  | 3.x       | Styling         | Utility-first, rapid development   |
| **Zustand**       | 4.x       | State mgmt      | Lightweight, simple API            |
| **Hls.js**        | 1.x       | HLS playback    | Adaptive bitrate, browser support  |
| **SWR**           | 2.x       | Data fetching   | Caching, revalidation, performance |
| **Framer Motion** | 10.x      | Animations      | Smooth UX, declarative syntax      |

### Project Structure

```
apps/web/
├── public/
│   ├── icons/
│   ├── images/
│   ├── fonts/
│   └── manifest.json         # PWA manifest
│
├── src/
│   ├── app/                  # Next.js App Router
│   │   ├── (auth)/
│   │   ├── (dashboard)/
│   │   ├── admin/
│   │   ├── layout.tsx
│   │   └── page.tsx
│   │
│   ├── components/
│   │   ├── auth/             # Auth forms
│   │   ├── player/           # Music player
│   │   ├── layout/           # Layout components
│   │   ├── song/             # Song components
│   │   ├── playlist/         # Playlist components
│   │   └── common/           # Reusable components
│   │
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── usePlayer.ts
│   │   ├── useDeviceFP.ts
│   │   ├── useSongs.ts
│   │   └── useApi.ts
│   │
│   ├── lib/
│   │   ├── api/              # API clients
│   │   ├── utils/            # Utilities
│   │   ├── store/            # Zustand stores
│   │   └── constants/
│   │
│   ├── styles/
│   │   ├── globals.css
│   │   ├── variables.css
│   │   └── animations.css
│   │
│   └── types/
│       ├── auth.types.ts
│       ├── song.types.ts
│       ├── player.types.ts
│       └── api.types.ts
│
├── .env.local
├── .env.production
├── next.config.js
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── README.md
```

### Dependencies

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "typescript": "^5.2.0",
    "tailwindcss": "^3.3.0",
    "zustand": "^4.4.0",
    "swr": "^2.2.0",
    "hls.js": "^1.4.0",
    "framer-motion": "^10.16.0",
    "tweetnacl": "^1.0.3",
    "js-cookie": "^3.0.5",
    "axios": "^1.5.0",
    "date-fns": "^2.30.0",
    "classnames": "^2.3.2"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "eslint": "^8.48.0",
    "eslint-config-next": "^14.0.0",
    "prettier": "^3.0.0",
    "jest": "^29.7.0",
    "@testing-library/react": "^14.0.0"
  }
}
```

---

## 🖥️ Backend Stack

### Core Technologies

| Công Nghệ       | Phiên Bản | Mục Đích     | Lý Do Chọn                      |
| :-------------- | :-------- | :----------- | :------------------------------ |
| **NestJS**      | 10.x      | Framework    | Enterprise-grade, modular, DI   |
| **Node.js**     | 20.x      | Runtime      | Async I/O, fast, event-driven   |
| **TypeScript**  | 5.x       | Type safety  | Production-grade quality        |
| **MongoDB**     | 6.x       | Database     | Document-based, flexible schema |
| **Mongoose**    | 7.x       | ODM          | Schema validation, hooks        |
| **Redis**       | 7.x       | Cache        | In-memory, fast, key-value      |
| **ioredis**     | 5.x       | Redis client | Promisified, cluster support    |
| **BullMQ**      | 4.x       | Job queue    | Distributed, reliable, fast     |
| **Passport.js** | 0.7.x     | Auth         | Flexible, multiple strategies   |
| **JWT**         | 9.x       | Tokens       | Stateless, standard             |

### Project Structure

```
apps/api/
├── src/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.service.ts
│   │   ├── auth.module.ts
│   │   ├── strategies/
│   │   ├── guards/
│   │   └── dto/
│   │
│   ├── users/
│   │   ├── users.controller.ts
│   │   ├── users.service.ts
│   │   ├── users.module.ts
│   │   ├── schemas/
│   │   └── dto/
│   │
│   ├── songs/
│   │   ├── songs.controller.ts
│   │   ├── songs.service.ts
│   │   ├── songs.module.ts
│   │   ├── schemas/
│   │   └── dto/
│   │
│   ├── streaming/
│   │   ├── streaming.controller.ts
│   │   ├── streaming.service.ts
│   │   ├── streaming.module.ts
│   │   ├── hls-generator.ts
│   │   └── dto/
│   │
│   ├── admin/
│   │   ├── admin.controller.ts
│   │   ├── admin.module.ts
│   │   ├── services/
│   │   └── dto/
│   │
│   ├── cache/
│   │   ├── redis.service.ts
│   │   └── cache.module.ts
│   │
│   ├── queue/
│   │   ├── queue.module.ts
│   │   └── processors/
│   │
│   ├── kms/
│   │   ├── kms.client.ts
│   │   ├── kms.module.ts
│   │   └── dto/
│   │
│   ├── common/
│   │   ├── guards/
│   │   ├── interceptors/
│   │   ├── decorators/
│   │   ├── filters/
│   │   └── utils/
│   │
│   ├── database/
│   │   ├── mongoose.config.ts
│   │   ├── database.module.ts
│   │   └── migrations/
│   │
│   ├── config/
│   │   ├── app.config.ts
│   │   ├── db.config.ts
│   │   ├── cache.config.ts
│   │   ├── jwt.config.ts
│   │   └── validation.ts
│   │
│   ├── app.module.ts
│   ├── main.ts
│   └── logger.ts
│
├── test/
│   ├── app.e2e-spec.ts
│   ├── auth.e2e-spec.ts
│   └── songs.e2e-spec.ts
│
├── .env
├── .env.example
├── .env.production
├── tsconfig.json
├── nest-cli.json
├── package.json
└── README.md
```

### Dependencies

```json
{
  "dependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/platform-express": "^10.0.0",
    "@nestjs/jwt": "^11.0.0",
    "@nestjs/passport": "^10.0.0",
    "@nestjs/mongoose": "^10.0.0",
    "@nestjs/config": "^3.0.0",
    "@nestjs/cache-manager": "^2.0.0",
    "@nestjs/bull": "^10.0.0",
    "@nestjs/microservices": "^10.0.0",
    "nestjs-cls": "^3.1.0",
    "mongoose": "^7.5.0",
    "redis": "^4.6.0",
    "ioredis": "^5.3.0",
    "bull": "^4.10.0",
    "bullmq": "^4.10.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "jsonwebtoken": "^9.1.0",
    "bcryptjs": "^2.4.3",
    "@grpc/grpc-js": "^1.9.0",
    "axios": "^1.5.0",
    "class-validator": "^0.14.0",
    "class-transformer": "^0.5.0"
  },
  "devDependencies": {
    "@nestjs/testing": "^10.0.0",
    "@types/node": "^20.0.0",
    "@types/express": "^4.17.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "eslint": "^8.48.0",
    "prettier": "^3.0.0",
    "jest": "^29.7.0",
    "@types/jest": "^29.5.0",
    "ts-jest": "^29.1.0"
  }
}
```

---

## 🔐 KMS Microservice Stack

### Core Technologies

| Công Nghệ       | Phiên Bản | Mục Đích              |
| :-------------- | :-------- | :-------------------- |
| **NestJS**      | 10.x      | Framework             |
| **gRPC**        | 1.9.x     | Service communication |
| **MySQL**       | 8.x       | Key storage           |
| **TypeORM**     | 0.3.x     | ORM                   |
| **Node Crypto** | -         | AES-128 encryption    |
| **Ed25519**     | -         | Key signing           |

### Project Structure

```
apps/kms/
├── src/
│   ├── grpc/
│   │   ├── key-management.controller.ts
│   │   ├── key-management.service.ts
│   │   ├── interceptors/
│   │   ├── proto/
│   │   └── grpc.module.ts
│   │
│   ├── crypto/
│   │   ├── crypto.service.ts
│   │   ├── crypto.module.ts
│   │   └── crypto.utils.ts
│   │
│   ├── database/
│   │   ├── entities/
│   │   ├── repositories/
│   │   ├── typeorm.config.ts
│   │   └── migrations/
│   │
│   ├── auth/
│   │   ├── jwt.service.ts
│   │   ├── device-fingerprint.service.ts
│   │   └── auth.module.ts
│   │
│   ├── config/
│   │   ├── grpc.config.ts
│   │   ├── db.config.ts
│   │   └── crypto.config.ts
│   │
│   ├── app.module.ts
│   └── main.ts
│
├── proto/
│   ├── key-management.proto
│   └── Makefile
│
├── test/
│   ├── crypto.service.spec.ts
│   └── key-management.service.spec.ts
│
├── .env
├── .env.example
├── tsconfig.json
├── package.json
└── README.md
```

### Proto Definition

```protobuf
// proto/key-management.proto

syntax = "proto3";

package musicstreaming;

service KeyManagement {
  rpc GenerateKey(GenerateKeyRequest) returns (GenerateKeyResponse);
  rpc GetKey(GetKeyRequest) returns (GetKeyResponse);
  rpc RotateKey(RotateKeyRequest) returns (RotateKeyResponse);
  rpc GetAuditLog(GetAuditLogRequest) returns (GetAuditLogResponse);
}

message GenerateKeyRequest {
  string song_id = 1;
  string user_id = 2;
  string device_fingerprint = 3;
}

message GenerateKeyResponse {
  string key_id = 1;
  bytes key = 2;
  bytes iv = 3;
  int64 expires_at = 4;
}

message GetKeyRequest {
  string song_id = 1;
  string user_id = 2;
  string device_fingerprint = 3;
}

message GetKeyResponse {
  bytes key = 1;
  bytes iv = 2;
}

message RotateKeyRequest {
  string song_id = 1;
}

message RotateKeyResponse {
  string new_key_id = 1;
  string old_key_id = 2;
}

message GetAuditLogRequest {
  int32 limit = 1;
  int32 offset = 2;
}

message GetAuditLogResponse {
  repeated AuditLog logs = 1;
  int32 total = 2;
}

message AuditLog {
  string action = 1;
  string user_id = 2;
  string song_id = 3;
  int64 timestamp = 4;
  bool success = 5;
}
```

---

## 💾 Database & Cache

### MongoDB

```yaml
# MongoDB Stack
Database: MongoDB Atlas
Version: 6.0+
Topology: 3-node replica set

Configuration:
  Region: us-east-1 (Primary)
  Secondary: us-west-2
  Secondary: eu-west-1

Backup:
  - Automatic daily snapshots
  - 7-day retention
  - Encrypted at rest
  - Global distribution

Indexes:
  - Full-text search on songs
  - Compound indexes for queries
  - TTL indexes for auto-deletion
```

### MySQL

```yaml
# MySQL Stack
Database: AWS RDS MySQL
Version: 8.0+
Configuration: Multi-AZ

Storage:
  - Encrypted EBS volumes
  - Automated backups (35 days)
  - Binary logging for replication

Tables:
  - keys (AES-128 key storage)
  - audit_logs (Access logs)
  - support_history (Support tickets)
```

### Redis

```yaml
# Redis Stack
Cache: AWS ElastiCache Redis
Version: 7.0+
Configuration: Cluster mode enabled

Nodes: 3 (3 shards × 1 replica each)
Memory: 3GB per node
Eviction: LRU (Least Recently Used)

Purpose:
  - Session storage
  - Metadata cache
  - Rate limiting
  - Job queue
```

---

## ☁️ Infrastructure & Cloud

### AWS Services

| Service         | Sử Dụng        | Mục Đích                |
| :-------------- | :------------- | :---------------------- |
| **EKS**         | Kubernetes     | Container orchestration |
| **EC2**         | Compute        | Node instances          |
| **RDS**         | MySQL          | Managed database        |
| **ElastiCache** | Redis          | Cache layer             |
| **S3**          | Storage        | File storage            |
| **ALB**         | Load balancer  | Traffic distribution    |
| **CloudFront**  | CDN            | Content delivery        |
| **CloudWatch**  | Monitoring     | Logs & metrics          |
| **IAM**         | Access control | Identity management     |
| **VPC**         | Networking     | Virtual private cloud   |
| **Route 53**    | DNS            | Domain management       |
| **ACM**         | SSL/TLS        | Certificate management  |

### Cloudflare Services

| Service     | Sử Dụng         | Mục Đích                  |
| :---------- | :-------------- | :------------------------ |
| **Workers** | Edge computing  | Request processing        |
| **R2**      | Storage         | Media storage (0$ egress) |
| **WAF**     | Security        | DDoS protection           |
| **Cache**   | Caching         | Content caching           |
| **KV**      | Key-value store | Edge data storage         |
| **Pages**   | Static hosting  | Frontend hosting          |

---

## 🔧 DevOps & Tools

### Containerization & Orchestration

```yaml
Technologies:
  Docker:
    Version: 24.0+
    Registries:
      - AWS ECR (private)
      - Docker Hub (public images)

  Kubernetes:
    Version: 1.27+
    Distribution: AWS EKS

  Helm:
    Version: 3.12+
    Purpose: Package management

  Terraform:
    Version: 1.6+
    Purpose: Infrastructure as Code
```

### Build Tools

```yaml
Monorepo Management:
  pnpm: ^8.0
    - Workspace management
    - Dependency deduplication
    - Fast installation

  Turborepo:
    - Build caching
    - Task orchestration
    - CI optimization

Build Systems:
  tsc: TypeScript compiler
  webpack: Code bundling (if needed)
  esbuild: Fast build tool
```

### CI/CD Tools

```yaml
GitHub Actions:
  - PR checks
  - Automated testing
  - Docker build & push
  - Deployment automation

SonarQube:
  - Code quality analysis
  - Coverage reporting
  - Security scanning

ArgoCD:
  - GitOps deployment
  - Automatic sync
  - Rollback capabilities
```

---

## 📊 Monitoring & Observability

### Metrics Collection

```yaml
Prometheus:
  Targets:
    - Kubernetes nodes
    - Pod metrics
    - Application metrics

  Scrape Interval: 15 seconds
  Retention: 15 days

Metrics Types:
  - HTTP request latency
  - Database query time
  - Cache hit rate
  - Error rates
  - Pod CPU/memory
```

### Visualization

```yaml
Grafana:
  Version: 9.0+
  Data Source: Prometheus

  Dashboards:
    - API Performance
    - Database Metrics
    - Kubernetes Cluster
    - Business Metrics
    - Security Events
```

### Logging

```yaml
ELK Stack:
  Elasticsearch:
    - Centralized logging
    - Full-text search
    - 30-day retention

  Logstash:
    - Log processing
    - Enrichment
    - Filtering

  Kibana:
    - Log visualization
    - Dashboards
    - Alerting
```

### Error Tracking

```yaml
Sentry:
  Integration: All services

  Features:
    - Real-time error alerts
    - Stack trace analysis
    - Release tracking
    - User feedback
    - Performance monitoring
```

---

## 🔐 Security & Compliance

### Security Tools

```yaml
Secret Management:
  AWS Secrets Manager:
    - Database credentials
    - API keys
    - JWT secrets

  HashiCorp Vault:
    - Dynamic secrets
    - Encryption as service

Scanning:
  Snyk:
    - Dependency vulnerabilities
    - Code scanning
    - Container scanning

  OWASP:
    - Security testing
    - Vulnerability assessment

TLS/SSL:
  Let's Encrypt:
    - Free certificates
    - Auto-renewal
    - Multi-domain support
```

### Compliance

```yaml
Standards:
  - GDPR (Data privacy)
  - OWASP Top 10 (Security)
  - SOC 2 (Security controls)
  - ISO 27001 (Info security)

Audit:
  - Regular security audits
  - Penetration testing
  - Compliance scanning
  - Access control review
```

---

## 📦 Dependencies & Versions

### Production Dependencies

```json
{
  "frontend": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "typescript": "^5.2.0",
    "zustand": "^4.4.0",
    "hls.js": "^1.4.0"
  },
  "backend": {
    "@nestjs/core": "^10.0.0",
    "mongoose": "^7.5.0",
    "ioredis": "^5.3.0",
    "bullmq": "^4.10.0",
    "passport-jwt": "^4.0.1"
  },
  "kms": {
    "@nestjs/microservices": "^10.0.0",
    "@grpc/grpc-js": "^1.9.0",
    "typeorm": "^0.3.0",
    "mysql2": "^3.6.0"
  },
  "infrastructure": {
    "docker": "^24.0.0",
    "kubernetes": "^1.27.0",
    "terraform": "^1.6.0",
    "helm": "^3.12.0"
  }
}
```

### Development Dependencies

```json
{
  "testing": {
    "jest": "^29.7.0",
    "@testing-library/react": "^14.0.0",
    "supertest": "^6.3.0",
    "ts-jest": "^29.1.0"
  },
  "linting": {
    "eslint": "^8.48.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "prettier": "^3.0.0"
  },
  "security": {
    "snyk": "^1.1200.0",
    "sonarqube-scanner": "^3.1.0"
  },
  "documentation": {
    "typedoc": "^0.24.0",
    "@compodoc/compodoc": "^1.1.0"
  }
}
```

---

## 📋 Version Management

### Release Strategy

```
Semantic Versioning: MAJOR.MINOR.PATCH

2.0.0
├─ MAJOR (2): Breaking changes, major features
├─ MINOR (0): New features, backward compatible
└─ PATCH (0): Bug fixes, patches

Release Process:
  dev → staging → main (tagged)
  - Each tag triggers production build
  - GitHub releases created automatically
```

### Dependency Updates

```
Policy:
  Security Updates: Apply immediately
  Major Updates: Quarterly review
  Minor Updates: Monthly
  Patch Updates: Continuous

Tools:
  Dependabot: Auto-update PRs
  Snyk: Vulnerability alerts
  npm audit: Regular checks
```

---

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-08
