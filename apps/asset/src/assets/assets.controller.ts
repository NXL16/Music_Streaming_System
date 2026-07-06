import { Controller, UseGuards } from '@nestjs/common';
import {
  AssetResponse,
  AssetServiceController,
  AssetServiceControllerMethods,
  DeleteAssetRequest,
  DeleteAssetResponse,
  FinalizeAssetUploadRequest,
  GetAssetRequest,
  ListAssetsRequest,
  ListAssetsResponse,
  ListAssetUsagesResponse,
  RegisterAssetUsagesResponse,
  RequestAssetUploadRequest,
  RequestAssetUploadResponse,
  SyncAssetUsagesRequest,
  SyncAssetUsagesResponse,
  UpdateAssetProcessingResultRequest,
} from '@musical/shared-proto';
import { AssetsService } from './assets.service';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';

@Controller()
@AssetServiceControllerMethods()
@UseGuards(InternalGrpcGuard)
export class AssetsController implements AssetServiceController {
  constructor(private readonly assetsService: AssetsService) {}

  requestAssetUpload(
    request: RequestAssetUploadRequest,
  ): Promise<RequestAssetUploadResponse> {
    return this.assetsService.requestUpload(request);
  }

  finalizeAssetUpload(
    request: FinalizeAssetUploadRequest,
  ): Promise<AssetResponse> {
    return this.assetsService.finalizeUpload(request);
  }

  getAsset(request: GetAssetRequest): Promise<AssetResponse> {
    return this.assetsService.getAsset(request);
  }

  listAssets(request: ListAssetsRequest): Promise<ListAssetsResponse> {
    return this.assetsService.listAssets(request);
  }

  deleteAsset(request: DeleteAssetRequest): Promise<DeleteAssetResponse> {
    return this.assetsService.deleteAsset(request);
  }

  updateAssetProcessingResult(
    request: UpdateAssetProcessingResultRequest,
  ): Promise<AssetResponse> {
    return this.assetsService.updateProcessingResult(request);
  }

  registerAssetUsages(
    request: SyncAssetUsagesRequest,
  ): Promise<RegisterAssetUsagesResponse> {
    return this.assetsService.registerUsages(request);
  }

  reconcileAssetUsages(
    request: SyncAssetUsagesRequest,
  ): Promise<SyncAssetUsagesResponse> {
    return this.assetsService.reconcileUsages(request);
  }

  listAssetUsages(
    request: GetAssetRequest,
  ): Promise<ListAssetUsagesResponse> {
    return this.assetsService.listUsages(request);
  }
}
