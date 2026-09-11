import { Module } from '@nestjs/common';
import { SongsModule } from '../songs/songs.module';
import { AssetsModule } from '../assets/assets.module';
import { PlaybackAccessService } from './playback-access.service';
import { MusicVideoPlaybackController } from './music-video-playback.controller';
import { MusicVideoCdnService } from './music-video-cdn.service';

@Module({
  imports: [SongsModule, AssetsModule],
  controllers: [MusicVideoPlaybackController],
  providers: [PlaybackAccessService, MusicVideoCdnService],
  exports: [PlaybackAccessService],
})
export class PlaybackAccessModule {}
