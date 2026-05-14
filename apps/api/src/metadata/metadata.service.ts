import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import type { ClientGrpc } from '@nestjs/microservices';
import { firstValueFrom } from 'rxjs';
import type {
  GetStreamDataRequest,
  MetadataServiceClient,
  StreamDataResponse,
} from '@musical/shared-proto';

@Injectable()
export class MetadataService implements OnModuleInit {
  private metadataClient: MetadataServiceClient;

  constructor(@Inject('METADATA_SERVICE') private readonly client: ClientGrpc) {
    this.metadataClient =
      this.client.getService<MetadataServiceClient>('MetadataService');
  }

  onModuleInit() {
    this.metadataClient =
      this.client.getService<MetadataServiceClient>('MetadataService');
  }

  async getStreamData(data: GetStreamDataRequest): Promise<StreamDataResponse> {
    return await firstValueFrom(this.metadataClient.getStreamData(data));
  }
}
