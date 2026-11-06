import { Controller, UseGuards } from "@nestjs/common";
import {
  CreateReportRequest,
  FinalizeReportAttachmentUploadRequest,
  GetReportAttachmentDownloadUrlRequest,
  ListReportsRequest,
  ReportAttachmentDownloadResponse,
  ReportAttachmentResponse,
  ReportResponse,
  ReportServiceController,
  ReportServiceControllerMethods,
  RequestReportAttachmentUploadRequest,
  RequestReportAttachmentUploadResponse,
  UpdateReportStatusRequest,
  ListReportsResponse,
} from "@musical/shared-proto";
import { InternalGrpcGuard } from "../common/guards/internal-grpc.guard";
import { ReportsService } from "./reports.service";

@Controller()
@ReportServiceControllerMethods()
@UseGuards(InternalGrpcGuard)
export class ReportsController implements ReportServiceController {
  constructor(private readonly reportsService: ReportsService) {}

  requestReportAttachmentUpload(
    request: RequestReportAttachmentUploadRequest,
  ): Promise<RequestReportAttachmentUploadResponse> {
    return this.reportsService.requestAttachmentUpload(request);
  }

  finalizeReportAttachmentUpload(
    request: FinalizeReportAttachmentUploadRequest,
  ): Promise<ReportAttachmentResponse> {
    return this.reportsService.finalizeAttachmentUpload(request);
  }

  createReport(request: CreateReportRequest): Promise<ReportResponse> {
    return this.reportsService.createReport(request);
  }

  listReports(request: ListReportsRequest): Promise<ListReportsResponse> {
    return this.reportsService.listReports(request);
  }

  updateReportStatus(
    request: UpdateReportStatusRequest,
  ): Promise<ReportResponse> {
    return this.reportsService.updateStatus(request);
  }

  getReportAttachmentDownloadUrl(
    request: GetReportAttachmentDownloadUrlRequest,
  ): Promise<ReportAttachmentDownloadResponse> {
    return this.reportsService.getAttachmentDownloadUrl(request);
  }
}
