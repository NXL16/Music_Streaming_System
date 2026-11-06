CREATE TYPE "ReportType" AS ENUM ('ISSUE', 'FEEDBACK');
CREATE TYPE "ReportStatus" AS ENUM ('NEW', 'VIEWED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');
CREATE TYPE "ReportAttachmentStatus" AS ENUM ('PENDING_UPLOAD', 'READY');

CREATE TABLE "reports" (
    "id" TEXT NOT NULL,
    "type" "ReportType" NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'NEW',
    "content" VARCHAR(1000) NOT NULL,
    "reporterUserId" VARCHAR(128) NOT NULL,
    "reporterUsername" VARCHAR(128) NOT NULL,
    "reporterEmail" VARCHAR(320) NOT NULL,
    "pageUrl" VARCHAR(2000) NOT NULL DEFAULT '',
    "clientContext" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "report_attachments" (
    "id" TEXT NOT NULL,
    "reportId" TEXT,
    "ownerUserId" VARCHAR(128) NOT NULL,
    "status" "ReportAttachmentStatus" NOT NULL DEFAULT 'PENDING_UPLOAD',
    "filename" VARCHAR(255) NOT NULL,
    "contentType" VARCHAR(128) NOT NULL,
    "checksum" CHAR(64) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "objectKey" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finalizedAt" TIMESTAMPTZ,
    CONSTRAINT "report_attachments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "report_attachments_objectKey_key" ON "report_attachments"("objectKey");
CREATE INDEX "reports_status_type_createdAt_idx" ON "reports"("status", "type", "createdAt");
CREATE INDEX "reports_reporterUserId_createdAt_idx" ON "reports"("reporterUserId", "createdAt");
CREATE INDEX "report_attachments_ownerUserId_status_createdAt_idx" ON "report_attachments"("ownerUserId", "status", "createdAt");
CREATE INDEX "report_attachments_reportId_idx" ON "report_attachments"("reportId");
ALTER TABLE "report_attachments" ADD CONSTRAINT "report_attachments_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
