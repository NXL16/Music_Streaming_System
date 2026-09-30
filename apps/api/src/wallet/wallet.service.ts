import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import { grpcFirstValueFrom } from '../common/utils/grpc-timeout';
import type {
  BankAccountResponse,
  DepositOrderRequest,
  DepositOrderResponse,
  GetBalanceResponse,
  GetWithdrawStatusResponse,
  NFBankWithdrawalRequest,
  NFBankWithdrawalResponse,
  SetWithdrawPINResponse,
  VerifyNFBankAccountResponse,
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

  async verifyNFBankAccount(
    accountNumber: string,
  ): Promise<VerifyNFBankAccountResponse> {
    return grpcFirstValueFrom(
      this.walletClient.verifyNfBankAccount({ accountNumber }, this.metadata()),
    );
  }

  async createNFBankWithdrawal(
    payload: NFBankWithdrawalRequest,
  ): Promise<NFBankWithdrawalResponse> {
    return grpcFirstValueFrom(
      this.walletClient.createNfBankWithdrawal(payload, this.metadata()),
    );
  }

  async getWithdrawStatus(userId: string): Promise<GetWithdrawStatusResponse> {
    return grpcFirstValueFrom(
      this.walletClient.getWithdrawStatus({ userId }, this.metadata()),
    );
  }

  async setWithdrawPin(
    userId: string,
    pin: string,
  ): Promise<SetWithdrawPINResponse> {
    return grpcFirstValueFrom(
      this.walletClient.setWithdrawPin({ userId, pin }, this.metadata()),
    );
  }

  async linkBankAccount(
    userId: string,
    accountNumber: string,
    pin: string,
    bankCode = 'NFBANK',
  ): Promise<BankAccountResponse> {
    return grpcFirstValueFrom(
      this.walletClient.linkBankAccount(
        { userId, bankCode, accountNumber, pin },
        this.metadata(),
      ),
    );
  }
}
