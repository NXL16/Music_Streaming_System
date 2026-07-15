# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
pnpm install                    # Install all dependencies
pnpm proto:gen                  # Generate proto types (Buf → TS + Go stubs)
pnpm dev                        # Start all services in parallel (runs proto:gen first)
pnpm dev:api                    # Start API gateway only
pnpm dev:song                   # Start Song service only
pnpm dev:identity               # Start Identity service only
pnpm dev:asset                  # Start Asset service only
pnpm dev:web                    # Start web frontend only (Next.js with Turbopack)
pnpm build                      # Build all apps
pnpm lint                       # Lint all apps
pnpm test                       # Test all apps
pnpm type-check                 # Type-check all apps
pnpm docker:up                  # Start Redis container (reads REDIS_PASSWORD from .env)
pnpm docker:down                # Stop Redis container
```

### Per-app commands (run from repo root)

```bash
pnpm --filter api lint                    # Lint single app
pnpm --filter song test                   # Test single app
pnpm --filter identity test:e2e           # E2E tests for single app
npx tsc --noEmit -p apps/api/tsconfig.json  # Type-check single app
```

### Prisma (per-app, each has its own schema and database)

```bash
cd apps/identity && npx prisma migrate dev    # Run migrations
cd apps/song && npx prisma generate           # Regenerate Prisma client
```

Each Prisma app (identity, song, asset, recommendation) outputs its generated client to `src/generated/prisma/`. All use PostgreSQL with `@prisma/adapter-pg` driver adapter. Song and asset have `postbuild` scripts that copy generated clients to `dist/`.

### Go services

```bash
cd apps/meta && go run cmd/server/main.go     # Run metadata service
cd apps/wallet && go run cmd/server/main.go   # Run wallet service
```

Go workspace is configured via `go.work` at the root (modules: `apps/meta`, `apps/wallet`, `packages/shared-proto`).

### Rust worker

```bash
cd apps/worker && cargo run                   # Run transcoding worker
```

The Rust worker's `build.rs` compiles `metadata_service.proto` for its gRPC client — no external protoc needed.

## Architecture

Polyglot microservice system: 5 NestJS services (TypeScript), 2 Go services, 1 Rust worker, 2 Cloudflare Workers, 1 Next.js frontend. Monorepo managed by **Turborepo + pnpm workspaces**; Go services use `go.work`.

### Service Map

```
Web (Next.js :3000)
  └─► API Gateway (NestJS :9999) ─── HTTP REST ───► clients
        ├─► Identity   (gRPC :8888)  PostgreSQL + MongoDB + Redis + BullMQ
        ├─► Song       (gRPC :7777)  PostgreSQL + Redis + BullMQ
        ├─► Asset      (gRPC :7979)  PostgreSQL + R2 + sharp + ffmpeg
        ├─► Recommend  (gRPC :7878)  PostgreSQL
        ├─► Metadata   (gRPC :4410)  MongoDB          [Go]
        └─► Wallet     (gRPC :50051) PostgreSQL        [Go, also HTTP :8080 for webhooks]

Async processing:
  API Gateway ──LPUSH──► Redis transcode_queue ──BLPOP──► Rust Worker
  Rust Worker ──gRPC──► Metadata service (store seek tables, waveform)
  Rust Worker ──LPUSH──► Redis song_completion_queue ──BLPOP──► Song service

R2 upload events:
  R2 bucket ──event──► Cloudflare Queue ──► Finalizer Worker ──HTTP──► API /finalize-upload

CDN streaming:
  Client ──► Stream Worker (cdn.404hz.me) ──► R2 processed/{songId}.m4a
```

### Key Directories

| Path | Purpose |
|------|---------|
| `apps/api/` | HTTP API Gateway — proxies to gRPC services, handles auth, presigned URLs |
| `apps/identity/` | Auth: signup, login, OAuth (Google), JWT, 2FA, sessions, security audit |
| `apps/song/` | Song CRUD, ingest pipeline, user libraries, music catalog (artists/albums/playlists), draft system |
| `apps/asset/` | Asset management — image/video upload to R2, processing with sharp/ffmpeg |
| `apps/recommendation/` | Home page recommendations — pages, sections, resource snapshots, listening stats |
| `apps/meta/` | Streaming metadata — seek tables, segments, waveform (Go + MongoDB) |
| `apps/wallet/` | Virtual coin wallet — deposit orders via MoMo/NF Bank (Go + raw SQL) |
| `apps/worker/` | Audio transcoder — downloads, transcodes, AES-CTR encrypts to fMP4, uploads (Rust) |
| `apps/finalizer/` | Cloudflare Worker — triggers finalize when R2 upload completes |
| `apps/stream-worker/` | Cloudflare Worker — CDN streaming proxy on `cdn.404hz.me`, range requests + CF Cache |
| `apps/web/` | Next.js 16 frontend — HLS playback (hls.js), zustand state, framer-motion, Tailwind CSS 4 |
| `packages/shared-proto/` | Proto definitions + generated TS/Go stubs (Buf v2) |
| `packages/shared-types/` | Shared TS types: Redis queue names, auth types, role enums, JWT interfaces |
| `packages/ts-config/` | Shared tsconfig base (ES2022, strict, moduleResolution Bundler) |

### Inter-Service Communication

- **gRPC** for all synchronous service-to-service calls. Proto files in `packages/shared-proto/`, generated via `pnpm proto:gen` (Buf v2 with `ts-proto`).
- **Redis queues** (`LPUSH`/`BLPOP`) for async jobs: `transcode_queue`, `song_completion_queue`, `song_asset_cleanup_queue`.
- **BullMQ** used by identity and song services for background job processing.
- **Redis** also used for auth sessions, rate limiting, distributed locks, token blacklists.
- **Cloudflare R2** for object storage (quarantine → production pipeline).

### Proto Generation

Buf v2 generates three outputs from `.proto` files in `packages/shared-proto/`:
1. Go protobuf types (output to package subdirectories like `identity/`, `metadata/`, `wallet/`)
2. Go gRPC service code
3. TypeScript via `ts-proto` (output to `src/generated/`, options: `nestJs=true`, `outputServices=grpc-js`, `addGrpcMetadata=true`)

The TS package also exports service constants (`IDENTITY`, `SONG`, `METADATA`, `WALLET`, `RECOMMENDATION`, `ASSET`) with package name, service name, and proto file path. The `resolveProtoPath()` helper locates `.proto` files at runtime.

### Song Upload Pipeline

1. API Gateway creates presigned URL → client uploads to R2 `quarantine/`
2. R2 event → Cloudflare Queue → Finalizer Worker → API `/finalize-upload`
3. API sets song status PROCESSING, pushes to `transcode_queue`
4. Rust Worker: download → transcode → AES-CTR encrypt (HKDF key derivation) → upload fMP4 to R2 `production/`
5. Worker stores technical metadata (segments, waveform) via Metadata gRPC
6. Worker pushes to `song_completion_queue` → Song service updates status to READY

### Catalog System

Admin-only (`SUPER_ADMIN` + `catalog.manage` permission). Draft-based workflow:
1. `POST /admin/catalog/{artists,albums,songs,playlists}/draft` — create/update draft
2. `POST /admin/catalog/drafts/:draftId/publish` — publish to live catalog
3. Public read via `GET /catalog/:storefront/...`

Protobuf Struct fields (`google.protobuf.Struct`) appear as `{ [key: string]: any }` in generated TS. The API gateway wraps/unwraps these between JSON and protobuf wire format via `wrapStructInput`/`unwrapStructOutput` helpers in `songs.service.ts`.

### Auth Flow

JWT Bearer tokens via `Authorization: Bearer <token>`. Identity service issues access + refresh tokens. Strict guards check Redis for token blacklist, device validity, and token version. Admin endpoints require `StrictJwtAuthGuard` + `AdminGuard` (verified email + 2FA) + `PermissionsGuard`.

## Code Conventions

- **Language**: Vietnamese for user-facing messages and git commits. English for code, types, and variable names.
- **NestJS gRPC services**: Each backend service registers as a gRPC microservice using constants from `@musical/shared-proto` (e.g., `SONG.PACKAGE`, `resolveProtoPath(SONG.PROTO_FILE)`). The API gateway uses `ClientGrpc` + `firstValueFrom()` to call them.
- **Prisma**: Each service has its own database and Prisma schema. Generated client goes to `src/generated/prisma/`. Config in `prisma.config.ts` using `@prisma/config` + `defineConfig()`.
- **ESLint 9**: Flat config (`eslint.config.mjs`) per app. `@typescript-eslint/no-explicit-any` is off, `no-floating-promises` and `no-unsafe-*` rules are warnings/errors. Web uses `eslint-config-next`.
- **Proto generation**: Buf v2 with `ts-proto` plugin. Run `pnpm proto:gen` after editing `.proto` files.
- **TypeScript**: Strict mode, target ES2022, moduleResolution Bundler. Shared base config in `packages/ts-config/base.json`.
- **Testing**: Jest 30 with `ts-jest`. Tests in `*.spec.ts`, E2E tests via `test/jest-e2e.json`.
- **Identity service**: Uses Prisma (PostgreSQL), Mongoose (MongoDB), and TypeORM together. Also uses argon2 for password hashing, `google-auth-library` for OAuth.
- **Go services**: Standard layout with `cmd/server/main.go` entry, `internal/` for domain logic. Meta uses MongoDB driver; Wallet uses `lib/pq` with raw SQL (`schema.sql`).
- **Rust worker**: Tokio async runtime, tonic for gRPC, pipeline architecture with modular steps (download → transcode → encrypt → upload).

## Required Infrastructure

- **Redis**: Single instance (Docker via `pnpm docker:up`), used by API gateway, identity, song, worker
- **PostgreSQL**: Separate databases for identity, song, asset, recommendation, wallet
- **MongoDB**: Used by identity (Mongoose) and metadata service (Go driver)
- **Cloudflare R2**: Object storage with `quarantine/` and `production/` key prefixes
- **ffmpeg/ffprobe**: Required by asset service for video processing (paths via `FFMPEG_PATH`, `FFPROBE_PATH` env vars)
