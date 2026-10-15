import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { AssetsService } from "./assets.service";
import { InternalGrpcGuard } from "../common/guards/internal-grpc.guard";
import { ProcessingModule } from "../processing/processing.module";

@Module({
  imports: [ProcessingModule],
  controllers: [AssetsController],
  providers: [AssetsService, InternalGrpcGuard],
})
export class AssetsModule {}
