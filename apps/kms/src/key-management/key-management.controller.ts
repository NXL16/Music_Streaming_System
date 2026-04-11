import { Controller } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { KeyManagementService } from './key-management.service';

// Interface khớp với Message Request trong file .proto
interface GenerateKeyRequest {
  song_id: string;
  user_id: string;
}

interface GetKeyRequest {
  song_id: string;
  user_id: string;
  device_fingerprint: string;
}

@Controller()
export class KeyManagementController {
  constructor(private readonly keyManagementService: KeyManagementService) {}

  // Ánh xạ tới rpc GenerateKey trong service KeyManagement của file proto
  @GrpcMethod('KeyManagement', 'GenerateKey')
  async generateKey(data: GenerateKeyRequest) {
    return await this.keyManagementService.generateKey(data);
  }

  @GrpcMethod('KeyManagement', 'GetKey')
  async getKey(data: GetKeyRequest) {
    return await this.keyManagementService.getKey(data);
  }
}
