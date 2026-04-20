import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import * as microservices from '@nestjs/microservices';
import { lastValueFrom, Observable } from 'rxjs';

interface GenerateKeyResponse {
  key_id: string;
  key: Uint8Array; // 'bytes' trong proto tương ứng với Uint8Array trong TS
  iv: Uint8Array;
}

interface GetKeyResponse {
  key: Uint8Array;
  iv: Uint8Array;
}

interface KeyManagementGrpcService {
  generateKey(data: {
    song_id: string;
    user_id: string;
  }): Observable<GenerateKeyResponse>;
  getKey(data: {
    song_id: string;
    user_id: string;
    device_fingerprint: string;
  }): Observable<GetKeyResponse>;
}

@Injectable()
export class KmsService implements OnModuleInit {
  private keyManagementGrpc!: KeyManagementGrpcService;

  constructor(
    @Inject('KMS_PACKAGE') private readonly client: microservices.ClientGrpc,
  ) {}

  onModuleInit() {
    this.keyManagementGrpc =
      this.client.getService<KeyManagementGrpcService>('KeyManagement');
  }

  async generateKey(songId: string, userId: string) {
    return await lastValueFrom(
      this.keyManagementGrpc.generateKey({ song_id: songId, user_id: userId }),
    );
  }

  async getKey(songId: string, userId: string, deviceFingerprint: string) {
    return await lastValueFrom(
      this.keyManagementGrpc.getKey({
        song_id: songId,
        user_id: userId,
        device_fingerprint: deviceFingerprint,
      }),
    );
  }
}
