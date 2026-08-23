import { credentials, type ChannelCredentials } from '@grpc/grpc-js';
import { readFileSync } from 'node:fs';

export type GrpcTlsOptions = {
  enabled: boolean;
  caFile: string;
  clientCertificateFile?: string;
  clientKeyFile?: string;
  serviceName: string;
};

/**
 * Builds a gRPC channel credential from mounted PEM files. Keeping the PEM
 * handling here prevents each service client from drifting on TLS/mTLS rules.
 */
export function grpcChannelCredentials(
  options: GrpcTlsOptions,
): ChannelCredentials {
  if (!options.enabled) return credentials.createInsecure();

  if (Boolean(options.clientCertificateFile) !== Boolean(options.clientKeyFile)) {
    throw new Error(
      `${options.serviceName} client certificate and key must be set together`,
    );
  }

  return credentials.createSsl(
    readPem(options.caFile, `${options.serviceName} CA`),
    options.clientKeyFile
      ? readPem(options.clientKeyFile, `${options.serviceName} client key`)
      : undefined,
    options.clientCertificateFile
      ? readPem(
          options.clientCertificateFile,
          `${options.serviceName} client certificate`,
        )
      : undefined,
  );
}

/**
 * Maps the shared `<SERVICE>_ENABLED/CA_FILE/CLIENT_*` convention used by
 * Nest clients to the lower-level credential builder.
 */
export function grpcChannelCredentialsFromEnvironment(
  get: (key: string) => string | undefined,
  prefix: string,
): ChannelCredentials {
  const certificateFile = optional(get(`${prefix}_CLIENT_CERT_FILE`));
  const keyFile = optional(get(`${prefix}_CLIENT_KEY_FILE`));
  if (Boolean(certificateFile) !== Boolean(keyFile)) {
    throw new Error(
      `${prefix}_CLIENT_CERT_FILE and ${prefix}_CLIENT_KEY_FILE must be set together`,
    );
  }

  return grpcChannelCredentials({
    enabled: enabled(get(`${prefix}_ENABLED`)),
    caFile: optional(get(`${prefix}_CA_FILE`)) || '',
    clientCertificateFile: certificateFile,
    clientKeyFile: keyFile,
    serviceName: prefix,
  });
}

function readPem(path: string, label: string): Buffer {
  try {
    return readFileSync(path);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`${label} could not be read: ${reason}`);
  }
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function optional(value: string | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized || undefined;
}
