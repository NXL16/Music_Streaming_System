import { Injectable } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { status } from "@grpc/grpc-js";
import { RpcException } from "@nestjs/microservices";
import {
  CreateReportRequest,
  FinalizeReportAttachmentUploadRequest,
  GetReportAttachmentDownloadUrlRequest,
  ListReportsRequest,
  ListReportsResponse,
  Report,
  ReportAttachment,
  ReportAttachmentDownloadResponse,
  ReportAttachmentKind,
  ReportAttachmentResponse,
  ReportResponse,
  ReportStatus,
  ReportType,
  RequestReportAttachmentUploadRequest,
  RequestReportAttachmentUploadResponse,
  UpdateReportStatusRequest,
} from "@musical/shared-proto";
import {
  Prisma,
  ReportAttachment as PrismaReportAttachment,
  ReportAttachmentStatus as PrismaAttachmentStatus,
  ReportStatus as PrismaReportStatus,
  ReportType as PrismaReportType,
} from "../generated/prisma/client";
import { PrismaService } from "../database/prisma.service";
import { StorageService } from "../storage/storage.service";

const MAX_ATTACHMENTS = 5;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
const MAX_LIST_LIMIT = 100;
const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
]);
const VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"]);

type ReportWithAttachments = Prisma.ReportGetPayload<{
  include: { attachments: true };
}>;

@Injectable()
export class ReportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async requestAttachmentUpload(
    request: RequestReportAttachmentUploadRequest,
  ): Promise<RequestReportAttachmentUploadResponse> {
    const ownerUserId = this.text(request.actorUserId, "actor_user_id", 128);
    const contentType = this.text(
      request.contentType,
      "content_type",
      128,
    ).toLowerCase();
    const kind = this.attachmentKind(request.kind, contentType);
    const sizeBytes = Number(request.sizeBytes);
    const maxSize =
      kind === ReportAttachmentKind.REPORT_ATTACHMENT_KIND_IMAGE
        ? MAX_IMAGE_BYTES
        : MAX_VIDEO_BYTES;
    if (
      !Number.isSafeInteger(sizeBytes) ||
      sizeBytes <= 0 ||
      sizeBytes > maxSize
    ) {
      this.invalid(`size_bytes must be between 1 and ${maxSize}`);
    }
    const checksum = this.text(request.checksum, "checksum", 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(checksum))
      this.invalid("checksum must be a SHA-256 hex string");

    const attachment = await this.prisma.reportAttachment.create({
      data: {
        ownerUserId,
        filename: this.text(request.filename, "filename", 255),
        contentType,
        checksum,
        sizeBytes: BigInt(sizeBytes),
        objectKey: `reports/${ownerUserId}/${randomUUID()}`,
      },
    });
    return {
      attachment: this.attachmentMessage(attachment),
      uploadUrl: await this.storage.createUploadUrl(
        attachment.objectKey,
        contentType,
      ),
    };
  }

  async finalizeAttachmentUpload(
    request: FinalizeReportAttachmentUploadRequest,
  ): Promise<ReportAttachmentResponse> {
    const attachment = await this.findAttachment(request.attachmentId);
    if (
      attachment.ownerUserId !==
      this.text(request.actorUserId, "actor_user_id", 128)
    )
      this.forbidden("REPORT_ATTACHMENT_ACCESS_DENIED");
    if (attachment.status === PrismaAttachmentStatus.READY)
      return { attachment: this.attachmentMessage(attachment) };

    const object = await this.storage.head(attachment.objectKey);
    if (object.contentLength !== Number(attachment.sizeBytes))
      this.failed("REPORT_UPLOAD_SIZE_MISMATCH");
    if (object.contentType.toLowerCase() !== attachment.contentType)
      this.failed("REPORT_UPLOAD_CONTENT_TYPE_MISMATCH");
    const prefix = await this.storage.getPrefix(attachment.objectKey);
    if (!this.hasExpectedSignature(prefix, attachment.contentType))
      this.failed("REPORT_UPLOAD_FILE_SIGNATURE_MISMATCH");

    const updated = await this.prisma.reportAttachment.update({
      where: { id: attachment.id },
      data: { status: PrismaAttachmentStatus.READY, finalizedAt: new Date() },
    });
    return { attachment: this.attachmentMessage(updated) };
  }

  async createReport(request: CreateReportRequest): Promise<ReportResponse> {
    const reporterUserId = this.text(
      request.reporterUserId,
      "reporter_user_id",
      128,
    );
    const attachmentIds = [...new Set(request.attachmentIds.filter(Boolean))];
    if (attachmentIds.length > MAX_ATTACHMENTS)
      this.invalid(
        `attachment_ids may contain at most ${MAX_ATTACHMENTS} items`,
      );
    const report = await this.prisma.$transaction(async (tx) => {
      const attachments = attachmentIds.length
        ? await tx.reportAttachment.findMany({
            where: { id: { in: attachmentIds } },
          })
        : [];
      if (attachments.length !== attachmentIds.length)
        this.invalid("REPORT_ATTACHMENT_NOT_FOUND");
      if (
        attachments.some(
          (item) =>
            item.ownerUserId !== reporterUserId ||
            item.status !== PrismaAttachmentStatus.READY ||
            item.reportId,
        )
      ) {
        this.forbidden("REPORT_ATTACHMENT_NOT_ATTACHABLE");
      }
      if (
        attachments.filter((item) => item.contentType.startsWith("video/"))
          .length > 1
      )
        this.invalid("REPORT_MAX_ONE_VIDEO");
      const imageChecksums = attachments
        .filter((item) => item.contentType.startsWith("image/"))
        .map((item) => item.checksum);
      if (new Set(imageChecksums).size !== imageChecksums.length)
        this.invalid("REPORT_DUPLICATE_IMAGE");

      const created = await tx.report.create({
        data: {
          type: this.reportType(request.type),
          content: this.text(request.content, "content", 1000),
          reporterUserId,
          reporterUsername: this.text(
            request.reporterUsername,
            "reporter_username",
            128,
          ),
          reporterEmail: this.email(request.reporterEmail),
          pageUrl: String(request.pageUrl || "").slice(0, 2000),
          clientContext: this.clientContext(request.clientContext),
        },
      });
      if (attachmentIds.length) {
        const linked = await tx.reportAttachment.updateMany({
          where: { id: { in: attachmentIds }, reportId: null },
          data: { reportId: created.id },
        });
        if (linked.count !== attachmentIds.length)
          this.failed("REPORT_ATTACHMENT_ALREADY_LINKED");
      }
      return tx.report.findUniqueOrThrow({
        where: { id: created.id },
        include: { attachments: true },
      });
    });
    return { report: this.reportMessage(report) };
  }

  async listReports(request: ListReportsRequest): Promise<ListReportsResponse> {
    const limit = Math.max(
      1,
      Math.min(MAX_LIST_LIMIT, Number(request.limit) || 20),
    );
    const cursor = request.cursor
      ? await this.prisma.report.findUnique({
          where: { id: request.cursor },
          select: { id: true, createdAt: true },
        })
      : null;
    const rows = await this.prisma.report.findMany({
      where: {
        ...(request.type ? { type: this.reportType(request.type) } : {}),
        ...(request.status
          ? { status: this.reportStatus(request.status) }
          : {}),
        ...(cursor
          ? {
              OR: [
                { createdAt: { lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, id: { lt: cursor.id } },
              ],
            }
          : {}),
      },
      include: { attachments: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      reports: page.map((item) => this.reportMessage(item)),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? "") : "",
      hasMore: rows.length > limit,
    };
  }

  async updateStatus(
    request: UpdateReportStatusRequest,
  ): Promise<ReportResponse> {
    const report = await this.prisma.report.update({
      where: { id: this.text(request.reportId, "report_id", 128) },
      data: { status: this.reportStatus(request.status) },
      include: { attachments: true },
    });
    return { report: this.reportMessage(report) };
  }

  async getAttachmentDownloadUrl(
    request: GetReportAttachmentDownloadUrlRequest,
  ): Promise<ReportAttachmentDownloadResponse> {
    const attachment = await this.findAttachment(request.attachmentId);
    if (
      !attachment.reportId ||
      attachment.status !== PrismaAttachmentStatus.READY
    )
      this.notFound("REPORT_ATTACHMENT_NOT_FOUND");
    return {
      downloadUrl: await this.storage.createDownloadUrl(attachment.objectKey),
    };
  }

  private attachmentKind(
    value: ReportAttachmentKind,
    contentType: string,
  ): ReportAttachmentKind {
    const expected = IMAGE_TYPES.has(contentType)
      ? ReportAttachmentKind.REPORT_ATTACHMENT_KIND_IMAGE
      : VIDEO_TYPES.has(contentType)
        ? ReportAttachmentKind.REPORT_ATTACHMENT_KIND_VIDEO
        : ReportAttachmentKind.REPORT_ATTACHMENT_KIND_UNSPECIFIED;
    if (
      expected === ReportAttachmentKind.REPORT_ATTACHMENT_KIND_UNSPECIFIED ||
      value !== expected
    )
      this.invalid("REPORT_ATTACHMENT_CONTENT_TYPE_NOT_SUPPORTED");
    return expected;
  }

  private hasExpectedSignature(prefix: Buffer, contentType: string): boolean {
    if (contentType === "image/jpeg")
      return prefix.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]));
    if (contentType === "image/png")
      return prefix
        .subarray(0, 8)
        .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    if (contentType === "image/webp")
      return (
        prefix.subarray(0, 4).toString("ascii") === "RIFF" &&
        prefix.subarray(8, 12).toString("ascii") === "WEBP"
      );
    if (contentType === "image/avif")
      return (
        prefix.subarray(4, 8).toString("ascii") === "ftyp" &&
        ["avif", "avis"].includes(prefix.subarray(8, 12).toString("ascii"))
      );
    if (contentType === "video/webm")
      return prefix
        .subarray(0, 4)
        .equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]));
    if (contentType === "video/mp4" || contentType === "video/quicktime")
      return prefix.subarray(4, 8).toString("ascii") === "ftyp";
    return false;
  }

  private reportType(value: ReportType): PrismaReportType {
    if (value === ReportType.REPORT_TYPE_ISSUE) return PrismaReportType.ISSUE;
    if (value === ReportType.REPORT_TYPE_FEEDBACK)
      return PrismaReportType.FEEDBACK;
    this.invalid("REPORT_TYPE_INVALID");
  }

  private reportStatus(value: ReportStatus): PrismaReportStatus {
    const values: Record<number, PrismaReportStatus> = {
      [ReportStatus.REPORT_STATUS_NEW]: PrismaReportStatus.NEW,
      [ReportStatus.REPORT_STATUS_VIEWED]: PrismaReportStatus.VIEWED,
      [ReportStatus.REPORT_STATUS_IN_PROGRESS]: PrismaReportStatus.IN_PROGRESS,
      [ReportStatus.REPORT_STATUS_RESOLVED]: PrismaReportStatus.RESOLVED,
      [ReportStatus.REPORT_STATUS_CLOSED]: PrismaReportStatus.CLOSED,
    };
    if (!values[value]) this.invalid("REPORT_STATUS_INVALID");
    return values[value];
  }

  private reportMessage(report: ReportWithAttachments): Report {
    return {
      id: report.id,
      type:
        report.type === PrismaReportType.ISSUE
          ? ReportType.REPORT_TYPE_ISSUE
          : ReportType.REPORT_TYPE_FEEDBACK,
      status: this.reportStatusMessage(report.status),
      content: report.content,
      reporterUserId: report.reporterUserId,
      reporterUsername: report.reporterUsername,
      reporterEmail: report.reporterEmail,
      pageUrl: report.pageUrl,
      clientContext: this.clientContextMessage(report.clientContext),
      attachments: report.attachments.map((item) =>
        this.attachmentMessage(item),
      ),
      createdAt: report.createdAt.toISOString(),
      updatedAt: report.updatedAt.toISOString(),
    };
  }

  private attachmentMessage(item: PrismaReportAttachment): ReportAttachment {
    return {
      id: item.id,
      reportId: item.reportId ?? "",
      filename: item.filename,
      contentType: item.contentType,
      sizeBytes: Number(item.sizeBytes),
      kind: item.contentType.startsWith("image/")
        ? ReportAttachmentKind.REPORT_ATTACHMENT_KIND_IMAGE
        : ReportAttachmentKind.REPORT_ATTACHMENT_KIND_VIDEO,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private reportStatusMessage(status: PrismaReportStatus): ReportStatus {
    const values: Record<PrismaReportStatus, ReportStatus> = {
      NEW: ReportStatus.REPORT_STATUS_NEW,
      VIEWED: ReportStatus.REPORT_STATUS_VIEWED,
      IN_PROGRESS: ReportStatus.REPORT_STATUS_IN_PROGRESS,
      RESOLVED: ReportStatus.REPORT_STATUS_RESOLVED,
      CLOSED: ReportStatus.REPORT_STATUS_CLOSED,
    };
    return values[status];
  }

  private clientContextMessage(
    value: Prisma.JsonValue | null,
  ): { [key: string]: any } | undefined {
    return value && typeof value === "object" && !Array.isArray(value)
      ? value
      : undefined;
  }

  private clientContext(
    value: { [key: string]: any } | undefined,
  ): Prisma.InputJsonValue | undefined {
    if (!value) return undefined;
    if (Buffer.byteLength(JSON.stringify(value), "utf8") > 4096)
      this.invalid("client_context must not exceed 4096 bytes");
    return value;
  }

  private async findAttachment(value: string): Promise<PrismaReportAttachment> {
    const item = await this.prisma.reportAttachment.findUnique({
      where: { id: this.text(value, "attachment_id", 128) },
    });
    if (!item) this.notFound("REPORT_ATTACHMENT_NOT_FOUND");
    return item;
  }

  private text(value: string, field: string, max: number): string {
    const normalized = String(value || "").trim();
    if (!normalized || normalized.length > max)
      this.invalid(
        `${field} is required and must not exceed ${max} characters`,
      );
    return normalized;
  }
  private email(value: string): string {
    const email = this.text(value, "reporter_email", 320).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email))
      this.invalid("reporter_email is invalid");
    return email;
  }
  private invalid(message: string): never {
    throw new RpcException({ code: status.INVALID_ARGUMENT, message });
  }
  private forbidden(message: string): never {
    throw new RpcException({ code: status.PERMISSION_DENIED, message });
  }
  private failed(message: string): never {
    throw new RpcException({ code: status.FAILED_PRECONDITION, message });
  }
  private notFound(message: string): never {
    throw new RpcException({ code: status.NOT_FOUND, message });
  }
}
