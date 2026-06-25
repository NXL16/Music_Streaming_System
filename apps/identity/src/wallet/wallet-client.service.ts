import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type { WalletServiceClient } from '@musical/shared-proto';

@Injectable()
export class WalletClientService implements OnModuleInit {
  private readonly logger = new Logger(WalletClientService.name);
  private walletClient!: WalletServiceClient;

  constructor(@Inject('WALLET_SERVICE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.walletClient =
      this.client.getService<WalletServiceClient>('WalletService');
  }

  async createWalletForUser(userId: string): Promise<void> {
    try {
      await firstValueFrom(this.walletClient.createWallet({ userId }));
    } catch (error) {
      this.logger.error(`Cannot create wallet for user=${userId}`, error);
      throw error;
    }
  }
}
