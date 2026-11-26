import {
  BadRequestException,
  Inject,
  Injectable,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Metadata } from '@grpc/grpc-js';
import { ConfigService } from '@nestjs/config';
import type { ClientGrpc } from '@nestjs/microservices';
import { grpcFirstValueFrom } from '../common/utils/grpc-timeout';
import type {
  BankAccountResponse,
  CoinRateResponse,
  PaymentOrderResponse,
  DebitWalletRequest,
  DebitWalletResponse,
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

  async getCoinRate(userId: string): Promise<CoinRateResponse> {
    return grpcFirstValueFrom(
      this.walletClient.getCoinRate({ userId }, this.metadata()),
    );
  }

  async getPaymentOrder(
    userId: string,
    kind: string,
    reference: string,
  ): Promise<PaymentOrderResponse> {
    return grpcFirstValueFrom(
      this.walletClient.getPaymentOrder(
        { userId, kind, reference },
        this.metadata(),
      ),
      35_000,
    );
  }

  async debit(payload: DebitWalletRequest): Promise<DebitWalletResponse> {
    return grpcFirstValueFrom(
      this.walletClient.debitWallet(payload, this.metadata()),
    );
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

  async getTransactionHistory(params: {
    userId: string;
    kind: 'ALL' | 'DEPOSIT' | 'WITHDRAWAL';
    limit: number;
    offset: number;
  }): Promise<{
    items: PaymentOrderResponse[];
    hasMore: boolean;
  }> {
    const walletHttpUrl =
      this.configService.getOrThrow<string>('WALLET_HTTP_URL');
    const internalToken = this.configService.getOrThrow<string>(
      'INTERNAL_GRPC_TOKEN',
    );

    const response = await fetch(
      `${walletHttpUrl}/internal/wallet/transactions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-token': internalToken,
        },
        body: JSON.stringify(params),
      },
    );

    if (response.status === 400) {
      throw new BadRequestException('Invalid transaction history query.');
    }
    if (!response.ok) {
      throw new ServiceUnavailableException(
        'Transaction history is temporarily unavailable.',
      );
    }

    return (await response.json()) as {
      items: PaymentOrderResponse[];
      hasMore: boolean;
    };
  }
}
