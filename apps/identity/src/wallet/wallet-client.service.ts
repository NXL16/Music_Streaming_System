import { Inject, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom, timeout } from 'rxjs';
import type { WalletServiceClient } from '@musical/shared-proto';

@Injectable()
export class WalletClientService implements OnModuleInit {
  private readonly logger = new Logger(WalletClientService.name);
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

  async createWalletForUser(
    userId: string,
    timeoutMs = DEFAULT_WALLET_GRPC_TIMEOUT_MS,
  ): Promise<void> {
    try {
      await firstValueFrom(
        this.walletClient
          .createWallet({ userId }, this.metadata())
          .pipe(timeout({ first: timeoutMs })),
      );
    } catch (error) {
      this.logger.error(`Cannot create wallet for user=${userId}`, error);
      throw error;
    }
  }
}

export const DEFAULT_WALLET_GRPC_TIMEOUT_MS = 10_000;
