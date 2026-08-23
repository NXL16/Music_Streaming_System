import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { metadataGrpcChannelCredentials } from './metadata-grpc-tls';

function config(values: Record<string, string | undefined>) {
  return {
    get: (key: string) => values[key],
    getOrThrow: (key: string) => {
      const value = values[key];
      if (!value) throw new Error(`${key} is required`);
      return value;
    },
  };
}

describe('metadata gRPC TLS credentials', () => {
  it('keeps local development explicitly insecure when TLS is disabled', () => {
    expect(
      metadataGrpcChannelCredentials(
        config({ META_GRPC_TLS_ENABLED: 'false' }) as never,
      ),
    ).toBeDefined();
  });

  it('requires a matching client certificate and key', () => {
    expect(() =>
      metadataGrpcChannelCredentials(
        config({
          META_GRPC_TLS_ENABLED: 'true',
          META_GRPC_TLS_CA_FILE: 'ca.pem',
          META_GRPC_TLS_CLIENT_CERT_FILE: 'client.pem',
        }) as never,
      ),
    ).toThrow(
      'META_GRPC_TLS_CLIENT_CERT_FILE and META_GRPC_TLS_CLIENT_KEY_FILE must be set together',
    );
  });

  it('fails closed when a mounted TLS file is not valid PEM', () => {
    const directory = mkdtempSync(join(tmpdir(), 'metadata-grpc-tls-'));
    const caFile = join(directory, 'ca.pem');
    const certificateFile = join(directory, 'client.pem');
    const keyFile = join(directory, 'client-key.pem');
    writeFileSync(caFile, 'not-parsed-until-connection');
    writeFileSync(certificateFile, 'not-parsed-until-connection');
    writeFileSync(keyFile, 'not-parsed-until-connection');

    try {
      expect(() =>
        metadataGrpcChannelCredentials(
          config({
            META_GRPC_TLS_ENABLED: 'true',
            META_GRPC_TLS_CA_FILE: caFile,
            META_GRPC_TLS_CLIENT_CERT_FILE: certificateFile,
            META_GRPC_TLS_CLIENT_KEY_FILE: keyFile,
          }) as never,
        ),
      ).toThrow('no start line');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
