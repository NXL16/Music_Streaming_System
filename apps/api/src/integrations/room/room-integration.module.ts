import { Module } from '@nestjs/common';
import { SongsModule } from '../../songs/songs.module';
import { StreamModule } from '../../stream/stream.module';
import { RoomClientAuthGuard } from './room-client-auth.guard';
import { RoomIntegrationController } from './room-integration.controller';
import { RoomIntegrationService } from './room-integration.service';
import { WalletModule } from '../../wallet/wallet.module';
import { RoomMusicCoinController } from './room-music-coin.controller';

@Module({
  imports: [SongsModule, StreamModule, WalletModule],
  controllers: [RoomIntegrationController, RoomMusicCoinController],
  providers: [RoomIntegrationService, RoomClientAuthGuard],
})
export class RoomIntegrationModule {}
