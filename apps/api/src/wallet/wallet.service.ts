import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
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

  constructor(@Inject('WALLET_SERVICE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.walletClient =
      this.client.getService<WalletServiceClient>('WalletService');
  }

  async getBalance(userId: string): Promise<GetBalanceResponse> {
    const balance = await grpcFirstValueFrom(
      this.walletClient.getBalance({ userId }),
    );

    return {
      coinBalance: balance.coinBalance ?? 0,
      frozenBalance: balance.frozenBalance ?? 0,
    };
  }

  async createDepositOrder(
    payload: DepositOrderRequest,
  ): Promise<DepositOrderResponse> {
    return grpcFirstValueFrom(this.walletClient.createDepositOrder(payload));
  }
}
