import {
  Body,
  BadRequestException,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ArrayMaxSize,
} from 'class-validator';
import type { Request } from 'express';
import type { JwtUser } from '@musical/shared-types';
import {
  ReportAttachmentKind,
  ReportStatus,
  ReportType,
} from '@musical/shared-proto';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { AdminGuard } from '../common/guards/admin.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { ReportsService } from './reports.service';
import { AuthService } from '../auth/auth.service';

class RequestAttachmentDto {
  @IsEnum(['IMAGE', 'VIDEO']) kind!: 'IMAGE' | 'VIDEO';
  @IsString() @MaxLength(255) filename!: string;
  @IsString() @MaxLength(128) contentType!: string;
  @IsString() @MaxLength(64) checksum!: string;
  @IsInt() @Min(1) sizeBytes!: number;
}
class FinalizeAttachmentDto {
  @IsString() @MaxLength(128) attachmentId!: string;
}
class CreateReportDto {
  @IsEnum(['ISSUE', 'FEEDBACK']) type!: 'ISSUE' | 'FEEDBACK';
  @IsString() @MaxLength(1000) content!: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsString({ each: true })
  attachmentIds?: string[];
  @IsOptional() @IsString() @MaxLength(2000) pageUrl?: string;
  @IsOptional() @IsObject() clientContext?: Record<string, unknown>;
}
class UpdateStatusDto {
  @IsEnum(['NEW', 'VIEWED', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status!: keyof typeof statusByName;
}

const typeByName = {
  ISSUE: ReportType.REPORT_TYPE_ISSUE,
  FEEDBACK: ReportType.REPORT_TYPE_FEEDBACK,
} as const;
const kindByName = {
  IMAGE: ReportAttachmentKind.REPORT_ATTACHMENT_KIND_IMAGE,
  VIDEO: ReportAttachmentKind.REPORT_ATTACHMENT_KIND_VIDEO,
} as const;
const statusByName = {
  NEW: ReportStatus.REPORT_STATUS_NEW,
  VIEWED: ReportStatus.REPORT_STATUS_VIEWED,
  IN_PROGRESS: ReportStatus.REPORT_STATUS_IN_PROGRESS,
  RESOLVED: ReportStatus.REPORT_STATUS_RESOLVED,
  CLOSED: ReportStatus.REPORT_STATUS_CLOSED,
} as const;

@Controller('reports')
@UseGuards(StrictJwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly auth: AuthService,
  ) {}
  @Post('attachments/uploads')
  requestAttachment(@Req() req: Request, @Body() dto: RequestAttachmentDto) {
    return this.reports.requestAttachmentUpload({
      actorUserId: (req.user as JwtUser).userId,
      kind: kindByName[dto.kind],
      filename: dto.filename,
      contentType: dto.contentType,
      checksum: dto.checksum,
      sizeBytes: dto.sizeBytes,
    });
  }
  @Post('attachments/:attachmentId/finalize')
  finalizeAttachment(@Req() req: Request, @Param() dto: FinalizeAttachmentDto) {
    return this.reports.finalizeAttachmentUpload({
      actorUserId: (req.user as JwtUser).userId,
      attachmentId: dto.attachmentId,
    });
  }
  @Post()
  async create(@Req() req: Request, @Body() dto: CreateReportDto) {
    const user = req.user as JwtUser;
    const profile = await this.auth.getProfile({ userId: user.userId });
    return this.reports.createReport({
      reporterUserId: user.userId,
      reporterUsername: user.username,
      reporterEmail: profile.email,
      type: typeByName[dto.type],
      content: dto.content,
      attachmentIds: dto.attachmentIds ?? [],
      pageUrl: dto.pageUrl ?? '',
      clientContext: dto.clientContext,
    });
  }
}

@Controller('admin/reports')
@UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
@Permissions('asset.manage')
export class AdminReportsController {
  constructor(private readonly reports: ReportsService) {}
  @Get()
  list(
    @Query('type') type?: keyof typeof typeByName,
    @Query('status') status?: keyof typeof statusByName,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit === undefined ? 20 : Number(limit);
    if (
      !Number.isSafeInteger(parsedLimit) ||
      parsedLimit < 1 ||
      parsedLimit > 100
    )
      throw new BadRequestException('REPORT_LIST_LIMIT_INVALID');
    if (cursor && cursor.length > 128)
      throw new BadRequestException('REPORT_LIST_CURSOR_INVALID');
    return this.reports.listReports({
      type: this.queryType(type),
      status: this.queryStatus(status),
      cursor: cursor ?? '',
      limit: parsedLimit,
    });
  }
  @Patch(':reportId/status')
  updateStatus(
    @Param('reportId') reportId: string,
    @Body() dto: UpdateStatusDto,
  ) {
    return this.reports.updateStatus({
      reportId,
      status: statusByName[dto.status],
    });
  }
  @Get('attachments/:attachmentId/download')
  attachmentDownloadUrl(@Param('attachmentId') attachmentId: string) {
    return this.reports.attachmentDownloadUrl({ attachmentId });
  }

  private queryType(value: string | undefined): ReportType {
    if (!value) return ReportType.REPORT_TYPE_UNSPECIFIED;
    if (!(value in typeByName))
      throw new BadRequestException('REPORT_TYPE_INVALID');
    return typeByName[value as keyof typeof typeByName];
  }

  private queryStatus(value: string | undefined): ReportStatus {
    if (!value) return ReportStatus.REPORT_STATUS_UNSPECIFIED;
    if (!(value in statusByName))
      throw new BadRequestException('REPORT_STATUS_INVALID');
    return statusByName[value as keyof typeof statusByName];
  }
}
