import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module';
import { RecommendationsController } from './recommendations.controller';
import { RecommendationsService } from './recommendations.service';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';

@Module({
  imports: [DatabaseModule],
  controllers: [RecommendationsController],
  providers: [RecommendationsService, InternalGrpcGuard],
  exports: [RecommendationsService],
})
export class RecommendationModule {}
