import { Module } from '@nestjs/common';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  GRPC_LOADER_OPTIONS,
  resolveProtoPath,
  WALLET,
} from '@musical/shared-proto';
import { WalletClientService } from './wallet-client.service';

@Module({
  imports: [
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
            protoPath: resolveProtoPath(WALLET.PROTO_FILE),
            loader: GRPC_LOADER_OPTIONS,
          },
        }),
      },
    ]),
  ],
  providers: [WalletClientService],
  exports: [WalletClientService],
})
export class WalletClientModule {}
