import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  AssetResponse,
  AssetServiceClient,
  DeleteAssetRequest,
  DeleteAssetResponse,
  FinalizeAssetUploadRequest,
  GetAssetRequest,
  ListAssetsRequest,
  ListAssetsResponse,
  ListAssetUsagesResponse,
  RequestAssetUploadRequest,
  RequestAssetUploadResponse,
} from '@musical/shared-proto';
import { ConfigService } from '@nestjs/config';
import { Metadata } from '@grpc/grpc-js';
import { grpcFirstValueFrom } from '../common/utils/grpc-timeout';

@Injectable()
export class AssetsService implements OnModuleInit {
  private client!: AssetServiceClient;

  constructor(
    @Inject('ASSET_SERVICE')
    private readonly grpcClient: ClientGrpc,
    private readonly configService: ConfigService,
  ) {}

  private metadata(): Metadata {
    const metadata = new Metadata();
    metadata.set(
      'x-internal-token',
      this.configService.getOrThrow<string>('INTERNAL_GRPC_TOKEN'),
    );
    return metadata;
  }

  onModuleInit(): void {
    this.client =
      this.grpcClient.getService<AssetServiceClient>('AssetService');
  }

  requestUpload(
    request: RequestAssetUploadRequest,
  ): Promise<RequestAssetUploadResponse> {
    return grpcFirstValueFrom(
      this.client.requestAssetUpload(request, this.metadata()),
    );
  }

  finalizeUpload(
    request: FinalizeAssetUploadRequest,
  ): Promise<AssetResponse> {
    return grpcFirstValueFrom(
      this.client.finalizeAssetUpload(request, this.metadata()),
    );
  }

  getAsset(request: GetAssetRequest): Promise<AssetResponse> {
    return grpcFirstValueFrom(this.client.getAsset(request, this.metadata()));
  }

  listAssets(request: ListAssetsRequest): Promise<ListAssetsResponse> {
    return grpcFirstValueFrom(this.client.listAssets(request, this.metadata()));
  }

  listAssetUsages(request: GetAssetRequest): Promise<ListAssetUsagesResponse> {
    return grpcFirstValueFrom(
      this.client.listAssetUsages(request, this.metadata()),
    );
  }

  deleteAsset(request: DeleteAssetRequest): Promise<DeleteAssetResponse> {
    return grpcFirstValueFrom(this.client.deleteAsset(request, this.metadata()));
  }
}
