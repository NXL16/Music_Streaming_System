import { BadRequestException, Body, Controller, Put, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../common/guards/admin.guard';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { Permissions } from '../common/decorators/permissions.decorator';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { SongsService } from './songs.service';

@Controller('admin/songs')
@UseGuards(StrictJwtAuthGuard, AdminGuard, PermissionsGuard)
@Permissions('catalog.manage')
export class FavoriteArtworkAdminController {
  constructor(private readonly songsService: SongsService) {}

  @Put('favorite-artwork')
  bind(@Body() body: { assetId?: string }) {
    if (!body.assetId?.trim()) {
      throw new BadRequestException('assetId is required');
    }
    return this.songsService.upsertFavoriteArtwork({ assetId: body.assetId.trim() });
  }
}
