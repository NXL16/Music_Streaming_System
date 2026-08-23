import { Module } from '@nestjs/common';
import { SongsModule } from '../songs/songs.module';
import { PlaybackAccessService } from './playback-access.service';

@Module({
  imports: [SongsModule],
  providers: [PlaybackAccessService],
  exports: [PlaybackAccessService],
})
export class PlaybackAccessModule {}
