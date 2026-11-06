import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  GRPC_LOADER_OPTIONS,
  REPORT,
  resolveProtoPath,
} from '@musical/shared-proto';
import { ReportsService } from './reports.service';
import {
  AdminReportsController,
  ReportsController,
} from './reports.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    AuthModule,
    ClientsModule.registerAsync([
      {
        name: 'REPORT_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: config.getOrThrow<string>('ASSET_GRPC_URL'),
            package: REPORT.PACKAGE,
            protoPath: resolveProtoPath(REPORT.PROTO_FILE),
            loader: GRPC_LOADER_OPTIONS,
          },
        }),
      },
    ]),
  ],
  controllers: [ReportsController, AdminReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
