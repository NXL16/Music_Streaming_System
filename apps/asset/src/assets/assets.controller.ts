import { Controller, UseGuards } from "@nestjs/common";
import {
  AssetResponse,
  AssetServiceController,
  AssetServiceControllerMethods,
  DeleteAssetRequest,
  DeleteAssetResponse,
  FinalizeAssetUploadRequest,
  GetAssetRequest,
  GetMusicVideoKeyRequest,
  GetMusicVideoKeyResponse,
  ListAssetsRequest,
  ListAssetsResponse,
  ListAssetUsagesResponse,
  RegisterAssetUsagesResponse,
  RequestAssetUploadRequest,
  RequestAssetUploadResponse,
  SyncAssetUsagesRequest,
  SyncAssetUsagesResponse,
} from "@musical/shared-proto";
import { AssetsService } from "./assets.service";
import { InternalGrpcGuard } from "../common/guards/internal-grpc.guard";

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

  getMusicVideoKey(
    request: GetMusicVideoKeyRequest,
  ): Promise<GetMusicVideoKeyResponse> {
    return this.assetsService.getMusicVideoKey(request);
  }

  listAssets(request: ListAssetsRequest): Promise<ListAssetsResponse> {
    return this.assetsService.listAssets(request);
  }

  deleteAsset(request: DeleteAssetRequest): Promise<DeleteAssetResponse> {
    return this.assetsService.deleteAsset(request);
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

  listAssetUsages(request: GetAssetRequest): Promise<ListAssetUsagesResponse> {
    return this.assetsService.listUsages(request);
  }
}
