import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { join } from "path";
import { KmsService } from "./kms.service";

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: "KMS_PACKAGE",
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: configService.get<string>("KMS_GRPC_URL") ?? "localhost:5000",
            package: "musicstreaming",
            protoPath: join(__dirname, "../../proto/key-management.proto"),
            loader: {
              keepCase: true,
            },
          },
        }),
      },
    ]),
  ],
  providers: [KmsService],
  exports: [KmsService],
})
export class KmsModule {}
