import { Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BullModule } from "@nestjs/bullmq";
import { TranscodeProcessor } from "./transcode.processor";
import { KmsModule } from "./kms/kms.module";
import { StorageModule } from "./storage/storage.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>("REDIS_HOST"),
          port: configService.get<number>("REDIS_PORT"),
        },
      }),
      inject: [ConfigService],
    }),

    BullModule.registerQueue({
      name: "transcode-queue",
    }),

    KmsModule,
    StorageModule,
  ],
  providers: [TranscodeProcessor],
})
export class AppModule {}
