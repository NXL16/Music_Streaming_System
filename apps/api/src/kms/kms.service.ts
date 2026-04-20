import { Injectable, Inject, OnModuleInit } from '@nestjs/common';
import * as microservices from '@nestjs/microservices';
import { lastValueFrom, Observable } from 'rxjs';
import {
  KmsGenerateKeyRequest,
  KmsGenerateKeyResponse,
  KmsGetKeyRequest,
  KmsGetKeyResponse,
} from '@musical/shared-types';

interface KeyManagementGrpcService {
  generateKey(data: KmsGenerateKeyRequest): Observable<KmsGenerateKeyResponse>;
  getKey(data: KmsGetKeyRequest): Observable<KmsGetKeyResponse>;
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
