import { Module } from '@nestjs/common';
import { SongsModule } from '../../songs/songs.module';
import { StreamModule } from '../../stream/stream.module';
import { RoomClientAuthGuard } from './room-client-auth.guard';
import { RoomIntegrationController } from './room-integration.controller';
import { RoomIntegrationService } from './room-integration.service';

@Module({
  imports: [SongsModule, StreamModule],
  controllers: [RoomIntegrationController],
  providers: [RoomIntegrationService, RoomClientAuthGuard],
})
export class RoomIntegrationModule {}
