import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { R2Module } from '../common/r2/r2.module';
import { ArtistOrAdminGuard } from '../common/guards/artist-or-admin.guard';
import { PlaylistsController } from './playlists.controller';
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
    ClientsModule.register([
      {
        name: 'SONG_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: SONG.PACKAGE,
          protoPath: resolveProtoPath(SONG.PROTO_FILE),
          url: '0.0.0.0:7777',
          loader: GRPC_LOADER_OPTIONS,
        },
      },
    ]),
  ],
  controllers: [
    SongsController,
    PlaylistsController,
    CatalogController,
    CatalogAdminController,
    ArtistStudioCatalogController,
  ],
  providers: [SongsService, ArtistOrAdminGuard],
  exports: [SongsService],
})
export class SongsModule {}
