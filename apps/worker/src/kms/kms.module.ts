import { Module } from "@nestjs/common";
import { ClientsModule, Transport } from "@nestjs/microservices";
import { join } from "path";
import { KmsService } from "./kms.service";

@Module({
  imports: [
    ClientsModule.register([
      {
        name: "KMS_PACKAGE",
        transport: Transport.GRPC,
        options: {
          url: "localhost:5000",
          package: "musicstreaming",
          protoPath: join(__dirname, "../../proto/key-management.proto"),
          loader: {
            keepCase: true,
          },
        },
      },
    ]),
  ],
  providers: [KmsService],
  exports: [KmsService],
})
export class KmsModule {}
