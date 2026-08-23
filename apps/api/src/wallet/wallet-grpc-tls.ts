import { ConfigService } from '@nestjs/config';
import { grpcChannelCredentialsFromEnvironment } from '@musical/shared-proto';

export function walletGrpcChannelCredentials(
  config: ConfigService,
): ReturnType<typeof grpcChannelCredentialsFromEnvironment> {
  return grpcChannelCredentialsFromEnvironment(
    (key) => config.get<string>(key),
    'WALLET_GRPC_TLS',
  );
}
