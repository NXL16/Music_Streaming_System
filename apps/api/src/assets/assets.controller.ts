import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  AssetKind,
  AssetPurpose,
  AssetStatus,
  RequestAssetUploadRequest,
} from '@musical/shared-proto';
import type { JwtUser } from '@musical/shared-types';
import type { Request } from 'express';
import { AdminGuard } from '../common/guards/admin.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { AssetsService } from './assets.service';
import { ArtistOrAdminGuard } from '../common/guards/artist-or-admin.guard';

@Controller('admin/assets')
@UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
@Permissions('asset.manage')
export class AssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('uploads')
  requestUpload(@Req() req: Request, @Body() body: RequestAssetUploadRequest) {
    return this.assetsService.requestUpload({
      ...body,
      actorUserId: (req.user as JwtUser).userId,
      kind: this.kind(body.kind),
      purpose: this.purpose(body.purpose),
    });
  }

  @Post(':assetId/finalize')
  finalizeUpload(@Req() req: Request, @Param('assetId') assetId: string) {
    return this.assetsService.finalizeUpload({
      assetId,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  @Get()
  listAssets(
    @Req() req: Request,
    @Query('kind') kind?: string,
    @Query('purpose') purpose?: string,
    @Query('status') assetStatus?: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.assetsService.listAssets({
      actorUserId: (req.user as JwtUser).userId,
      kind: this.kind(kind),
      purpose: this.purpose(purpose),
      status: this.status(assetStatus),
      cursor: cursor || '',
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get(':assetId')
  getAsset(@Param('assetId') assetId: string) {
    return this.assetsService.getAsset({ assetId });
  }

  @Get(':assetId/usages')
  listAssetUsages(@Param('assetId') assetId: string) {
    return this.assetsService.listAssetUsages({ assetId });
  }

  @Delete(':assetId')
  deleteAsset(@Req() req: Request, @Param('assetId') assetId: string) {
    return this.assetsService.deleteAsset({
      assetId,
      actorUserId: (req.user as JwtUser).userId,
    });
  }

  private kind(value: AssetKind | string | undefined): AssetKind {
    if (
      value === AssetKind.ASSET_KIND_IMAGE ||
      String(value).toUpperCase() === 'IMAGE'
    ) {
      return AssetKind.ASSET_KIND_IMAGE;
    }
    if (
      value === AssetKind.ASSET_KIND_VIDEO ||
      String(value).toUpperCase() === 'VIDEO'
    ) {
      return AssetKind.ASSET_KIND_VIDEO;
    }
    return AssetKind.ASSET_KIND_UNSPECIFIED;
  }

  private purpose(value: AssetPurpose | string | undefined): AssetPurpose {
    if (
      value === AssetPurpose.ASSET_PURPOSE_ARTWORK ||
      String(value).toUpperCase() === 'ARTWORK'
    ) {
      return AssetPurpose.ASSET_PURPOSE_ARTWORK;
    }
    if (
      value === AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO ||
      String(value).toUpperCase() === 'EDITORIAL_VIDEO'
    ) {
      return AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO;
    }
    return AssetPurpose.ASSET_PURPOSE_UNSPECIFIED;
  }

  private status(value: string | undefined): AssetStatus {
    const statuses: Record<string, AssetStatus> = {
      PENDING_UPLOAD: AssetStatus.ASSET_STATUS_PENDING_UPLOAD,
      PROCESSING: AssetStatus.ASSET_STATUS_PROCESSING,
      READY: AssetStatus.ASSET_STATUS_READY,
      FAILED: AssetStatus.ASSET_STATUS_FAILED,
      DELETED: AssetStatus.ASSET_STATUS_DELETED,
    };
    return (
      statuses[String(value).toUpperCase()] ??
      AssetStatus.ASSET_STATUS_UNSPECIFIED
    );
  }
}

@Controller('studio/assets')
@UseGuards(StrictJwtAuthGuard, ArtistOrAdminGuard)
export class ArtistStudioAssetsController {
  constructor(private readonly assetsService: AssetsService) {}

  @Post('uploads')
  requestUpload(@Req() req: Request, @Body() body: RequestAssetUploadRequest) {
    return this.assetsService.requestUpload({
      ...body,
      actorUserId: (req.user as JwtUser).userId,
      kind:
        body.kind === AssetKind.ASSET_KIND_VIDEO
          ? AssetKind.ASSET_KIND_VIDEO
          : AssetKind.ASSET_KIND_IMAGE,
      purpose:
        body.purpose === AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO
          ? AssetPurpose.ASSET_PURPOSE_EDITORIAL_VIDEO
          : AssetPurpose.ASSET_PURPOSE_ARTWORK,
    });
  }

  @Post(':assetId/finalize')
  finalizeUpload(@Req() req: Request, @Param('assetId') assetId: string) {
    return this.assetsService.finalizeUpload({
      assetId,
      actorUserId: (req.user as JwtUser).userId,
    });
  }
}
