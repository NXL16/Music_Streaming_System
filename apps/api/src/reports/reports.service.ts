import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { ConfigService } from '@nestjs/config';
import { Metadata } from '@grpc/grpc-js';
import {
  CreateReportRequest,
  FinalizeReportAttachmentUploadRequest,
  GetReportAttachmentDownloadUrlRequest,
  ListReportsRequest,
  ListReportsResponse,
  ReportAttachmentDownloadResponse,
  ReportAttachmentResponse,
  ReportResponse,
  ReportServiceClient,
  RequestReportAttachmentUploadRequest,
  RequestReportAttachmentUploadResponse,
  UpdateReportStatusRequest,
} from '@musical/shared-proto';
import { grpcFirstValueFrom } from '../common/utils/grpc-timeout';

@Injectable()
export class ReportsService implements OnModuleInit {
  private client!: ReportServiceClient;
  constructor(
    @Inject('REPORT_SERVICE') private readonly grpcClient: ClientGrpc,
    private readonly config: ConfigService,
  ) {}
  onModuleInit(): void {
    this.client =
      this.grpcClient.getService<ReportServiceClient>('ReportService');
  }
  private metadata(): Metadata {
    const metadata = new Metadata();
    metadata.set(
      'x-internal-token',
      this.config.getOrThrow<string>('INTERNAL_GRPC_TOKEN'),
    );
    return metadata;
  }
  requestAttachmentUpload(
    request: RequestReportAttachmentUploadRequest,
  ): Promise<RequestReportAttachmentUploadResponse> {
    return grpcFirstValueFrom(
      this.client.requestReportAttachmentUpload(request, this.metadata()),
    );
  }
  finalizeAttachmentUpload(
    request: FinalizeReportAttachmentUploadRequest,
  ): Promise<ReportAttachmentResponse> {
    return grpcFirstValueFrom(
      this.client.finalizeReportAttachmentUpload(request, this.metadata()),
    );
  }
  createReport(request: CreateReportRequest): Promise<ReportResponse> {
    return grpcFirstValueFrom(
      this.client.createReport(request, this.metadata()),
    );
  }
  listReports(request: ListReportsRequest): Promise<ListReportsResponse> {
    return grpcFirstValueFrom(
      this.client.listReports(request, this.metadata()),
    );
  }
  updateStatus(request: UpdateReportStatusRequest): Promise<ReportResponse> {
    return grpcFirstValueFrom(
      this.client.updateReportStatus(request, this.metadata()),
    );
  }
  attachmentDownloadUrl(
    request: GetReportAttachmentDownloadUrlRequest,
  ): Promise<ReportAttachmentDownloadResponse> {
    return grpcFirstValueFrom(
      this.client.getReportAttachmentDownloadUrl(request, this.metadata()),
    );
  }
}
