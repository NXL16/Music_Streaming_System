# 🔄 Thiết Lập CI/CD - Hệ Thống Phát Nhạc

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07

---

## 📑 Mục Lục

1. [Tổng Quan CI/CD](#tổng-quan-cicd)
2. [GitHub Actions Setup](#github-actions-setup)
3. [Workflows](#workflows)
4. [Deployment Strategies](#deployment-strategies)
5. [Testing & Quality Gates](#testing--quality-gates)
6. [Monitoring & Notifications](#monitoring--notifications)
7. [Troubleshooting](#troubleshooting-cicd)

---

## 🎯 Tổng Quan CI/CD

### CI/CD Pipeline Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Developer Push to Git                    │
│                    (git push origin feature)                │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
        ┌────────────────────────────────┐
        │  GitHub Actions Triggered      │
        │  (Webhook auto-trigger)        │
        └────────┬───────────────────────┘
                 │
         ┌───────┴───────┐
         │               │
         ▼               ▼
    ┌────────────┐  ┌──────────────┐
    │ PR Checks  │  │ Push to Main │
    ├────────────┤  ├──────────────┤
    │ - Lint     │  │ - Build      │
    │ - Test     │  │ - Test       │
    │ - Security │  │ - Security   │
    │ - Coverage │  │ - Build img  │
    └────────────┘  └──────┬───────┘
         │                 │
         ▼                 ▼
    ┌────────────┐  ┌──────────────┐
    │ PR Merged  │  │ Push to ECR  │
    │ (if pass)  │  │ (Docker img) │
    └────────────┘  └──────┬───────┘
                           │
                 ┌─────────┴─────────┐
                 │                   │
                 ▼                   ▼
         ┌──────────────┐  ┌────────────────┐
         │ Deploy Stage │  │ Deploy Prod    │
         │              │  │ (Manual Approval)
         │ - Smoke Test │  │ - Smoke Test   │
         │ - E2E Test   │  │ - Sanity Check │
         │ - Perf Check │  │ - Go Live      │
         └──────────────┘  └────────────────┘
                 │                   │
                 └─────────┬─────────┘
                           │
                           ▼
                ┌──────────────────┐
                │   Live System    │
                │  (All Users)     │
                └──────────────────┘
```

### Environments

```
┌──────────────────────────────────────────────────────────┐
│ Development (dev branch)                                 │
│ ├─ Auto-deploy khi commit                               │
│ ├─ Quick testing                                        │
│ └─ DB: Fresh data từ production (sanitized)             │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────────────┐
│ Staging (staging branch)                                │
│ ├─ Deploy trước production                              │
│ ├─ Full testing (E2E, load tests)                       │
│ ├─ DB: Copy từ production                               │
│ └─ Monitoring enabled                                   │
└──────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────┐
│ Production (main branch)                                │
│ ├─ Manual deployment                                    │
│ ├─ Approval required                                    │
│ ├─ DB: Real data                                        │
│ ├─ Full monitoring & alerts                             │
│ └─ Auto-rollback on failure                             │
���───────────────────────────────────────────────────────┘
```

---

## ⚙️ GitHub Actions Setup

### Bước 1: Tạo GitHub Secrets

```bash
# Truy cập: Repository Settings → Secrets and variables → Actions

# Tạo các secrets:

# AWS Credentials
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
ECR_URL=123456789012.dkr.ecr.us-east-1.amazonaws.com

# Database
MONGODB_URI_STAGING=mongodb+srv://user:pass@staging.mongodb.net/music_streaming_staging
MONGODB_URI_PROD=mongodb+srv://user:pass@prod.mongodb.net/music_streaming_prod
MYSQL_PASSWORD=secure_password_123

# Kubernetes
KUBECONFIG_STAGING=<base64 encoded kubeconfig>
KUBECONFIG_PROD=<base64 encoded kubeconfig>

# Notifications
SLACK_WEBHOOK=https://hooks.slack.com/services/XXX/YYY/ZZZ
PAGERDUTY_KEY=integration_key_xyz

# API Keys
DOCKER_USERNAME=your_docker_username
DOCKER_PASSWORD=your_docker_password

# Deployment
DEPLOYMENT_USER=deployment
DEPLOYMENT_KEY=<base64 encoded SSH key>
```

### Bước 2: Tạo Workflow Files

```bash
mkdir -p .github/workflows
touch .github/workflows/pr-checks.yml
touch .github/workflows/deploy-staging.yml
touch .github/workflows/deploy-production.yml
touch .github/workflows/security-scan.yml
touch .github/workflows/performance-test.yml
```

---

## 🔄 Workflows

### Workflow 1: PR Checks

**File:** `.github/workflows/pr-checks.yml`

```yaml
name: PR Checks

on:
  pull_request:
    branches: [main, develop, staging]
    paths:
      - "apps/**"
      - "packages/**"
      - "tools/**"
      - ".github/workflows/pr-checks.yml"

jobs:
  lint:
    name: Lint & Format
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0 # Full history for better analysis

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8

      - name: Install dependencies
        run: pnpm install

      - name: ESLint
        run: pnpm run lint
        continue-on-error: true

      - name: Format check
        run: pnpm run format:check
        continue-on-error: true

      - name: TypeScript check
        run: pnpm run type-check
        continue-on-error: true

  test:
    name: Unit Tests
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20]
    services:
      mongodb:
        image: mongo:6
        options: >-
          --health-cmd mongosh
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 27017:27017

      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: ${{ matrix.node-version }}
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Run tests
        run: pnpm run test:ci
        env:
          MONGODB_URI: mongodb://localhost:27017/music_streaming_test
          REDIS_HOST: localhost
          REDIS_PORT: 6379

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
          flags: unittests
          name: codecov-umbrella
          fail_ci_if_error: false
          verbose: true

  integration-test:
    name: Integration Tests
    runs-on: ubuntu-latest
    services:
      mongodb:
        image: mongo:6
        ports:
          - 27017:27017
      redis:
        image: redis:7
        ports:
          - 6379:6379
      mysql:
        image: mysql:8
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: test_db
        options: >-
          --health-cmd="mysqladmin ping"
          --health-interval=10s
          --health-timeout=5s
          --health-retries=3
        ports:
          - 3306:3306

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: Run integration tests
        run: pnpm run test:integration
        env:
          MONGODB_URI: mongodb://localhost:27017/test
          REDIS_HOST: localhost
          MYSQL_HOST: localhost
          MYSQL_USER: root
          MYSQL_PASSWORD: root

  security-check:
    name: Security Checks
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

      - name: npm audit
        run: npm audit --audit-level=moderate
        continue-on-error: true

      - name: Dependency check
        uses: dependency-check/Dependency-Check_Action@main
        with:
          project: "music-streaming-hls"
          path: "."
          format: "JSON"
        continue-on-error: true

      - name: Secret scan
        run: |
          npm install -g truffleHog
          truffleHog filesystem . --json --fail --max-depth 3
        continue-on-error: true

  code-quality:
    name: Code Quality
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          fetch-depth: 0

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: "20"
          cache: "pnpm"

      - name: Install dependencies
        run: pnpm install

      - name: SonarQube Scan
        uses: SonarSource/sonarcloud-github-action@master
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          SONAR_TOKEN: ${{ secrets.SONAR_TOKEN }}

  pr-comment:
    name: Post PR Comment
    runs-on: ubuntu-latest
    if: always()
    needs: [lint, test, integration-test, security-check, code-quality]
    steps:
      - name: Comment on PR
        uses: actions/github-script@v6
        with:
          script: |
            const status = ${{ needs.test.result == 'success' ? 'true' : 'false' }};
            const comment = `
            ## CI/CD Status
            - ✅ Lint: ${{ needs.lint.result == 'success' ? '✅ Pass' : '❌ Fail' }}
            - ✅ Unit Tests: ${{ needs.test.result == 'success' ? '✅ Pass' : '❌ Fail' }}
            - ✅ Integration Tests: ${{ needs.integration-test.result == 'success' ? '✅ Pass' : '❌ Fail' }}
            - ✅ Security: ${{ needs.security-check.result == 'success' ? '✅ Pass' : '❌ Fail' }}
            - ✅ Code Quality: ${{ needs.code-quality.result == 'success' ? '✅ Pass' : '❌ Fail' }}
            `;
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: comment
            });
```

### Workflow 2: Deploy to Staging

**File:** `.github/workflows/deploy-staging.yml`

```yaml
name: Deploy to Staging

on:
  push:
    branches: [staging]
    paths:
      - "apps/**"
      - "packages/**"
      - "tools/**"
      - "devops/**"
      - ".github/workflows/deploy-staging.yml"

env:
  ECR_REPOSITORY_API: music-streaming-api
  ECR_REPOSITORY_KMS: music-streaming-kms
  ECR_REPOSITORY_WORKER: music-streaming-worker
  IMAGE_TAG: staging-${{ github.sha }}

jobs:
  build-and-push:
    name: Build & Push to ECR
    runs-on: ubuntu-latest
    outputs:
      image-tag: ${{ env.IMAGE_TAG }}
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build API image
        run: |
          docker build -t ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_API }}:${{ env.IMAGE_TAG }} \
            -f tools/docker/Dockerfile.api .

      - name: Build KMS image
        run: |
          docker build -t ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_KMS }}:${{ env.IMAGE_TAG }} \
            -f tools/docker/Dockerfile.kms .

      - name: Build Worker image
        run: |
          docker build -t ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_WORKER }}:${{ env.IMAGE_TAG }} \
            -f tools/docker/Dockerfile.worker .

      - name: Push API image to ECR
        run: |
          docker push ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_API }}:${{ env.IMAGE_TAG }}

      - name: Push KMS image to ECR
        run: |
          docker push ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_KMS }}:${{ env.IMAGE_TAG }}

      - name: Push Worker image to ECR
        run: |
          docker push ${{ steps.login-ecr.outputs.registry }}/${{ env.ECR_REPOSITORY_WORKER }}:${{ env.IMAGE_TAG }}

  deploy-staging:
    name: Deploy to Staging Cluster
    runs-on: ubuntu-latest
    needs: build-and-push
    steps:
      - uses: actions/checkout@v3

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig --name music-streaming-staging --region ${{ secrets.AWS_REGION }}

      - name: Deploy API to Staging
        run: |
          kubectl set image deployment/api-deployment \
            api=123456789012.dkr.ecr.us-east-1.amazonaws.com/music-streaming-api:${{ needs.build-and-push.outputs.image-tag }} \
            -n music-streaming-staging

      - name: Deploy KMS to Staging
        run: |
          kubectl set image deployment/kms-deployment \
            kms=123456789012.dkr.ecr.us-east-1.amazonaws.com/music-streaming-kms:${{ needs.build-and-push.outputs.image-tag }} \
            -n music-streaming-staging

      - name: Deploy Worker to Staging
        run: |
          kubectl set image deployment/worker-deployment \
            worker=123456789012.dkr.ecr.us-east-1.amazonaws.com/music-streaming-worker:${{ needs.build-and-push.outputs.image-tag }} \
            -n music-streaming-staging

      - name: Wait for rollout
        run: |
          kubectl rollout status deployment/api-deployment -n music-streaming-staging --timeout=5m
          kubectl rollout status deployment/kms-deployment -n music-streaming-staging --timeout=5m
          kubectl rollout status deployment/worker-deployment -n music-streaming-staging --timeout=5m

      - name: Run smoke tests
        run: |
          chmod +x scripts/smoke-tests-staging.sh
          ./scripts/smoke-tests-staging.sh

      - name: Notify Slack
        if: success()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "✅ Staging deployment successful",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Staging Deployment*\n✅ Success\nCommit: ${{ github.sha }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

      - name: Notify Slack on failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "❌ Staging deployment failed",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Staging Deployment*\n❌ Failed\nCommit: ${{ github.sha }}\nAuthor: ${{ github.actor }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### Workflow 3: Deploy to Production (Manual)

**File:** `.github/workflows/deploy-production.yml`

```yaml
name: Deploy to Production

on:
  workflow_dispatch: # Manual trigger
    inputs:
      version:
        description: "Version to deploy"
        required: true
        type: string
      approval:
        description: "Approval confirmation"
        required: true
        type: choice
        options:
          - "I confirm this is production deployment"

jobs:
  pre-deployment-checks:
    name: Pre-Deployment Checks
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
        with:
          ref: main

      - name: Verify main branch
        run: |
          if [ "$(git rev-parse --abbrev-ref HEAD)" != "main" ]; then
            echo "❌ Must deploy from main branch"
            exit 1
          fi

      - name: Check version tag exists
        run: |
          if ! git rev-parse "v${{ github.event.inputs.version }}" >/dev/null 2>&1; then
            echo "❌ Version tag not found: v${{ github.event.inputs.version }}"
            exit 1
          fi

      - name: Verify database backup exists
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Check backups
        run: |
          # Check MongoDB backup
          aws s3 ls s3://music-streaming-backups/mongodb/ --recursive | tail -1

          # Check MySQL backup
          aws s3 ls s3://music-streaming-backups/mysql/ --recursive | tail -1

  build-and-push:
    name: Build & Push to ECR
    runs-on: ubuntu-latest
    needs: pre-deployment-checks
    steps:
      - uses: actions/checkout@v3
        with:
          ref: v${{ github.event.inputs.version }}

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v1

      - name: Build & Push images
        run: |
          docker build -t ${{ steps.login-ecr.outputs.registry }}/music-streaming-api:${{ github.event.inputs.version }} \
            -f tools/docker/Dockerfile.api .
          docker push ${{ steps.login-ecr.outputs.registry }}/music-streaming-api:${{ github.event.inputs.version }}

          docker build -t ${{ steps.login-ecr.outputs.registry }}/music-streaming-kms:${{ github.event.inputs.version }} \
            -f tools/docker/Dockerfile.kms .
          docker push ${{ steps.login-ecr.outputs.registry }}/music-streaming-kms:${{ github.event.inputs.version }}

  deploy-production:
    name: Deploy to Production
    runs-on: ubuntu-latest
    needs: build-and-push
    environment:
      name: production
      url: https://api.yourdomain.com
    steps:
      - uses: actions/checkout@v3
        with:
          ref: v${{ github.event.inputs.version }}

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v2
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: ${{ secrets.AWS_REGION }}

      - name: Update kubeconfig
        run: |
          aws eks update-kubeconfig --name music-streaming-prod --region ${{ secrets.AWS_REGION }}

      - name: Deploy to Production
        run: |
          kubectl set image deployment/api-deployment \
            api=123456789012.dkr.ecr.us-east-1.amazonaws.com/music-streaming-api:${{ github.event.inputs.version }} \
            -n music-streaming-prod

      - name: Verify deployment
        run: |
          kubectl rollout status deployment/api-deployment -n music-streaming-prod --timeout=10m

      - name: Run smoke tests
        run: |
          chmod +x scripts/smoke-tests-prod.sh
          ./scripts/smoke-tests-prod.sh

      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: v${{ github.event.inputs.version }}
          name: Release ${{ github.event.inputs.version }}
          body: |
            Production deployment of version ${{ github.event.inputs.version }}
            - API: Updated
            - KMS: Updated
            - Worker: Updated
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Notify Slack Success
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
                    "text": "*Production Deployment*\n✅ Success\nVersion: ${{ github.event.inputs.version }}\nDeployed by: ${{ github.actor }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}

      - name: Notify Slack Failure
        if: failure()
        uses: slackapi/slack-github-action@v1
        with:
          payload: |
            {
              "text": "❌ Production deployment failed",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Production Deployment*\n❌ Failed\nVersion: ${{ github.event.inputs.version }}\nDeployed by: ${{ github.actor }}"
                  }
                }
              ]
            }
        env:
          SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

---

## 🎯 Deployment Strategies

### Blue-Green Deployment

```yaml
# devops/kubernetes/blue-green-deployment.yml

apiVersion: apps/v1
kind: Deployment
metadata:
  name: api-deployment-green
  namespace: music-streaming-prod
spec:
  replicas: 3
  selector:
    matchLabels:
      app: api
      version: green
  template:
    metadata:
      labels:
        app: api
        version: green
    spec:
      containers:
        - name: api
          image: ecr.../api:new-version
          ports:
            - containerPort: 3000

---
# Service points to blue initially
apiVersion: v1
kind: Service
metadata:
  name: api-service
  namespace: music-streaming-prod
spec:
  selector:
    app: api
    version: blue # Initially pointing to blue
  ports:
    - port: 80
      targetPort: 3000

---
# Switch to green after validation
# kubectl patch service api-service -p '{"spec":{"selector":{"version":"green"}}}'
```

### Canary Deployment

```yaml
# Progressive rollout: 10% → 50% → 100%

apiVersion: networking.istio.io/v1beta1
kind: VirtualService
metadata:
  name: api
  namespace: music-streaming-prod
spec:
  hosts:
    - api.yourdomain.com
  http:
    - match:
        - headers:
            user-agent:
              regex: ".*canary.*"
      route:
        - destination:
            host: api
            subset: v2
    - route:
        - destination:
            host: api
            subset: v1
          weight: 90
        - destination:
            host: api
            subset: v2
          weight: 10

---
# Gradually increase weight
# kubectl patch virtualservice api -p '{"spec":{"http":[{"route":[{"weight":50},{"weight":50}]}]}}'
```

---

## 🧪 Testing & Quality Gates

### SonarQube Configuration

```properties
# sonar-project.properties

sonar.projectKey=music-streaming-hls
sonar.projectName=Music Streaming HLS
sonar.projectVersion=2.0.0

sonar.sources=apps,packages,tools
sonar.exclusions=**/*.spec.ts,node_modules/**,dist/**

sonar.javascript.lcov.reportPaths=coverage/lcov.info

sonar.qualitygate.wait=true
sonar.qualitygate.timeout=600

# Coverage
sonar.coverage.exclusions=**/*.spec.ts,**/dist/**
```

### Jest Configuration

```javascript
// jest.config.js

module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/apps", "<rootDir>/packages"],
  testMatch: ["**/__tests__/**/*.ts?(x)", "**/?(*.)+(spec|test).ts?(x)"],
  collectCoverageFrom: [
    "apps/**/*.ts",
    "packages/**/*.ts",
    "!**/*.spec.ts",
    "!**/dist/**",
    "!**/node_modules/**",
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
```

---

## 📢 Monitoring & Notifications

### Slack Integration

```yaml
# workflow notifications

- name: Notify Slack
  uses: slackapi/slack-github-action@v1
  with:
    payload: |
      {
        "text": "CI/CD Pipeline Status",
        "blocks": [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "🚀 *Build Status*\n*Repository:* ${{ github.repository }}\n*Branch:* ${{ github.ref }}\n*Commit:* ${{ github.sha }}\n*Author:* ${{ github.actor }}\n*Status:* ✅ Success"
            }
          },
          {
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "text": {
                  "type": "plain_text",
                  "text": "View Workflow"
                },
                "url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
              }
            ]
          }
        ]
      }
  env:
    SLACK_WEBHOOK_URL: ${{ secrets.SLACK_WEBHOOK }}
```

### PagerDuty Integration

```yaml
- name: Trigger PagerDuty Alert
  if: failure()
  uses: morrissimo/pagerduty-action@v1
  with:
    routing-key: ${{ secrets.PAGERDUTY_KEY }}
    dedup-key: ${{ github.run_id }}
    event-action: trigger
    payload: |
      {
        "summary": "Production deployment failed",
        "severity": "critical",
        "source": "GitHub Actions",
        "custom_details": {
          "repository": "${{ github.repository }}",
          "branch": "${{ github.ref }}",
          "actor": "${{ github.actor }}",
          "run_url": "${{ github.server_url }}/${{ github.repository }}/actions/runs/${{ github.run_id }}"
        }
      }
```

---

## 🔧 Troubleshooting CI/CD

### Sự Cố: Workflow Stuck in Pending

**Giải Pháp:**

```bash
# 1. Check runner status
gh run list --repo owner/repo

# 2. Check specific run
gh run view RUN_ID --repo owner/repo

# 3. Cancel stuck run
gh run cancel RUN_ID --repo owner/repo

# 4. Re-run workflow
gh run rerun RUN_ID --repo owner/repo
```

### Sự Cố: Build Fails Due to Secret

**Giải Pháp:**

```bash
# 1. List secrets
gh secret list --repo owner/repo

# 2. Update secret
gh secret set AWS_ACCESS_KEY_ID --repo owner/repo --body "$ACTUAL_KEY"

# 3. Verify secret (not visible, but can test)
# Run workflow again

# 4. Debug: Print masked secret
echo "${{ secrets.AWS_ACCESS_KEY_ID }}"  # Prints: ***
```

---

**Phiên Bản:** 2.0.0  
**Cập Nhật Lần Cuối:** 2026-04-07
