import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { join } from 'path';
import { WalletController } from './wallet.controller';
import { WalletService } from './wallet.service';
import { WALLET } from '@musical/shared-proto';

@Module({
  imports: [
    ConfigModule,
    ClientsModule.registerAsync([
      {
        name: 'WALLET_SERVICE',
        imports: [ConfigModule],
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            url: config.getOrThrow<string>('WALLET_GRPC_URL'),
            package: WALLET.PACKAGE,
            protoPath: join(
              __dirname,
              '../../../../packages/shared-proto',
              WALLET.PROTO_FILE,
            ),
            loader: { longs: Number },
          },
        }),
      },
    ]),
  ],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
