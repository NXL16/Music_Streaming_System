import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import {
  AssetResponse,
  AssetServiceClient,
  DeleteAssetRequest,
  DeleteAssetResponse,
  FinalizeAssetUploadRequest,
  GetAssetRequest,
  GetMusicVideoKeyRequest,
  GetMusicVideoKeyResponse,
  ListAssetsRequest,
  ListAssetsResponse,
  ListAssetUsagesResponse,
  RequestAssetUploadRequest,
  RequestAssetUploadResponse,
  ReplaceMusicVideoPosterRequest,
  SyncAssetUsagesRequest,
  SyncAssetUsagesResponse,
} from '@musical/shared-proto';
import { ConfigService } from '@nestjs/config';
import { Metadata } from '@grpc/grpc-js';
import { grpcFirstValueFrom } from '../common/utils/grpc-timeout';

// Poster replacement downloads the source video and can include a Modal cold start.
// Keep the longer deadline local to this operation; ordinary Asset RPCs stay at 10s.
const MUSIC_VIDEO_POSTER_REPLACEMENT_TIMEOUT_MS = 2 * 60 * 1000;

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

  finalizeUpload(request: FinalizeAssetUploadRequest): Promise<AssetResponse> {
    return grpcFirstValueFrom(
      this.client.finalizeAssetUpload(request, this.metadata()),
    );
  }

  getAsset(request: GetAssetRequest): Promise<AssetResponse> {
    return grpcFirstValueFrom(this.client.getAsset(request, this.metadata()));
  }

  getMusicVideoKey(
    request: GetMusicVideoKeyRequest,
  ): Promise<GetMusicVideoKeyResponse> {
    return grpcFirstValueFrom(
      this.client.getMusicVideoKey(request, this.metadata()),
    );
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
    return grpcFirstValueFrom(
      this.client.deleteAsset(request, this.metadata()),
    );
  }

  replaceMusicVideoPoster(
    request: ReplaceMusicVideoPosterRequest,
  ): Promise<AssetResponse> {
    return grpcFirstValueFrom(
      this.client.replaceMusicVideoPoster(request, this.metadata()),
      MUSIC_VIDEO_POSTER_REPLACEMENT_TIMEOUT_MS,
    );
  }

  reconcileUsages(
    request: SyncAssetUsagesRequest,
  ): Promise<SyncAssetUsagesResponse> {
    return grpcFirstValueFrom(
      this.client.reconcileAssetUsages(request, this.metadata()),
    );
  }
}
