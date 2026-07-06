import { Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { MicroserviceOptions, Transport } from "@nestjs/microservices";
import {
  ASSET,
  GRPC_LOADER_OPTIONS,
  resolveProtoPath,
} from "@musical/shared-proto";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const config = new ConfigService();
  const grpcUrl = config.getOrThrow<string>("ASSET_GRPC_URL");
  const app = await NestFactory.createMicroservice<MicroserviceOptions>(
    AppModule,
    {
      transport: Transport.GRPC,
      options: {
        package: ASSET.PACKAGE,
        protoPath: resolveProtoPath(ASSET.PROTO_FILE),
        url: grpcUrl,
        loader: GRPC_LOADER_OPTIONS,
      },
    },
  );
  await app.listen();

  Logger.log(`Asset gRPC server running at ${grpcUrl}`);
}

bootstrap().catch((error) => Logger.error("Asset startup failed", error));
