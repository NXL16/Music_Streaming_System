import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import { grpcFirstValueFrom } from '../common/utils/grpc-timeout';
import type {
  DepositOrderRequest,
  DepositOrderResponse,
  GetBalanceResponse,
  WalletServiceClient,
} from '@musical/shared-proto';

@Injectable()
export class WalletService implements OnModuleInit {
  private walletClient!: WalletServiceClient;

  constructor(
    @Inject('WALLET_SERVICE') private readonly client: ClientGrpc,
    private readonly configService: ConfigService,
  ) {}

  private metadata(): Metadata {
    const metadata = new Metadata();
    metadata.set(
      'x-internal-token',
      this.configService.getOrThrow<string>('INTERNAL_GRPC_TOKEN'),
    );
    return metadata;
  }

  onModuleInit() {
    this.walletClient =
      this.client.getService<WalletServiceClient>('WalletService');
  }

  async getBalance(userId: string): Promise<GetBalanceResponse> {
    const balance = await grpcFirstValueFrom(
      this.walletClient.getBalance({ userId }, this.metadata()),
    );

    return {
      coinBalance: balance.coinBalance ?? 0,
      frozenBalance: balance.frozenBalance ?? 0,
    };
  }

  async createDepositOrder(
    payload: DepositOrderRequest,
  ): Promise<DepositOrderResponse> {
    return grpcFirstValueFrom(
      this.walletClient.createDepositOrder(payload, this.metadata()),
    );
  }
}
