import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SongsController } from './songs.controller';
import { SongsService } from './songs.service';
import { Song, SongSchema } from './schemas/song.schema';
import { BullModule } from '@nestjs/bullmq';
import { TranscodeListener } from './transcode.listener';
import { KmsModule } from '../kms/kms.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Song.name, schema: SongSchema }]),
    BullModule.registerQueue({
      name: 'transcode-queue',
    }),
    KmsModule,
  ],
  controllers: [SongsController],
  providers: [SongsService, TranscodeListener],
  exports: [SongsService],
})
export class SongsModule {}
