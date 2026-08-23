import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';
import { MetadataModule } from '../metadata/metadata.module';
import { PlaybackAccessModule } from '../playback-access/playback-access.module';

@Module({
  imports: [ConfigModule, MetadataModule, PlaybackAccessModule],
  controllers: [StreamController],
  providers: [StreamService],
  exports: [StreamService],
})
export class StreamModule {}
