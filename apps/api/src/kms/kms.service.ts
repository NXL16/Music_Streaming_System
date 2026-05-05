import {
  Injectable,
  Inject,
  OnModuleInit,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  KeyManagementServiceClient,
  KeyResponse,
  GenerateKeyRequest,
  GetKeyRequest,
} from '@musical/shared-proto';
import type { ClientGrpc } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class KmsService implements OnModuleInit {
  private keyManagementGrpc!: KeyManagementServiceClient;

  constructor(@Inject('KMS_PACKAGE') private readonly client: ClientGrpc) {}

  onModuleInit() {
    this.keyManagementGrpc = this.client.getService<KeyManagementServiceClient>(
      'KeyManagementService',
    );
  }

  async generateKey(
    songId: string,
    userId: string = 'system',
  ): Promise<KeyResponse> {
    try {
      const request: GenerateKeyRequest = { songId, userId };

      return await lastValueFrom(
        this.keyManagementGrpc.generateSongKey(request),
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      throw new InternalServerErrorException(
        `KMS_GENERATE_FAILED: ${errorMessage}`,
      );
    }
  }

  async getKey(songId: string): Promise<KeyResponse> {
    try {
      const request: GetKeyRequest = { songId };

      const result = await lastValueFrom(
        this.keyManagementGrpc.getSongKey(request),
      );

      if (!result) throw new Error('Empty response from KMS');
      return result;
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      throw new NotFoundException(
        `KMS_KEY_NOT_FOUND: ${songId} - ${errorMessage}`,
      );
    }
  }
}
