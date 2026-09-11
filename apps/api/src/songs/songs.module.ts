import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { R2Module } from '../common/r2/r2.module';
import { ArtistOrAdminGuard } from '../common/guards/artist-or-admin.guard';
import { RecommendationsModule } from '../recommendations/recommendations.module';
import { PlaylistsController } from './playlists.controller';
import { FavoriteArtworkAdminController } from './favorite-artwork.controller';
import {
  ArtistWorkspaceAdminController,
  ArtistWorkspacesController,
} from './artist-workspaces.controller';
import { AuthModule } from '../auth/auth.module';
import {
  CatalogAdminController,
  ArtistStudioCatalogController,
  CatalogController,
} from './catalog.controller';
import {
  GRPC_LOADER_OPTIONS,
  SONG,
  resolveProtoPath,
} from '@musical/shared-proto';

@Module({
  imports: [
    R2Module,
    AuthModule,
    RecommendationsModule,
    ClientsModule.registerAsync([
      {
        name: 'SONG_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: SONG.PACKAGE,
            protoPath: resolveProtoPath(SONG.PROTO_FILE),
            url: configService.getOrThrow<string>('SONG_GRPC_URL'),
            loader: GRPC_LOADER_OPTIONS,
          },
        }),
      },
    ]),
  ],
  controllers: [
    SongsController,
    PlaylistsController,
    CatalogController,
    CatalogAdminController,
    ArtistStudioCatalogController,
    FavoriteArtworkAdminController,
    ArtistWorkspacesController,
    ArtistWorkspaceAdminController,
  ],
  providers: [SongsService, ArtistOrAdminGuard],
  exports: [SongsService],
})
export class SongsModule {}
