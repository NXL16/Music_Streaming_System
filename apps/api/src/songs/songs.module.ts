import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { R2Module } from '../common/r2/r2.module';
import { CatalogController } from './catalog.controller';
import { resolveProtoPath, SONG } from '@musical/shared-proto';

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
          loader: { longs: Number },
        },
      },
    ]),
  ],
  controllers: [SongsController, CatalogController],
  providers: [SongsService],
  exports: [SongsService],
})
export class SongsModule {}
