import { Module } from '@nestjs/common';
import { AssetsController } from './assets.controller';
import { AssetsService } from './assets.service';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';

@Module({
  controllers: [AssetsController],
  providers: [AssetsService, InternalGrpcGuard],
})
export class AssetsModule {}
