import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { join } from 'path';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { R2Module } from '../common/r2/r2.module';

@Module({
  imports: [
    R2Module,
    ClientsModule.register([
      {
        name: 'SONG_SERVICE',
        transport: Transport.GRPC,
        options: {
          package: 'song_service',
          protoPath: join(
            __dirname,
            '../../../../packages/shared-proto/song_service.proto',
          ),
          url: '0.0.0.0:7777',
          loader: { longs: Number },
        },
      },
    ]),
  ],
  controllers: [SongsController],
  providers: [SongsService],
  exports: [SongsService],
})
export class SongsModule {}
