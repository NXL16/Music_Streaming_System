import { ConfigService } from '@nestjs/config';
import { grpcChannelCredentialsFromEnvironment } from '@musical/shared-proto';

export function metadataGrpcChannelCredentials(
  config: ConfigService,
): ReturnType<typeof grpcChannelCredentialsFromEnvironment> {
  return grpcChannelCredentialsFromEnvironment(
    (key) => config.get<string>(key),
    'META_GRPC_TLS',
  );
}
