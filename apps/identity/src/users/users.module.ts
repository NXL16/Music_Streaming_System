import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import {
  UserMetadata,
  UserMetadataSchema,
} from './schemas/user-metadata.schema';
import { UsersController } from './users.controller';
import { InternalGrpcGuard } from '../common/guards/internal-grpc.guard';
import { WalletClientModule } from '../wallet/wallet-client.module';
import { UserProvisioningOutboxService } from './user-provisioning-outbox.service';

@Module({
  imports: [
    WalletClientModule,
    MongooseModule.forFeature([
      { name: UserMetadata.name, schema: UserMetadataSchema },
    ]),
  ],
  controllers: [UsersController],
  providers: [
    UsersService,
    UserProvisioningOutboxService,
    InternalGrpcGuard,
  ],
  exports: [UsersService],
})
export class UsersModule {}
