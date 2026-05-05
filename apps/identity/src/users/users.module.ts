import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UsersService } from './users.service';
import {
  UserMetadata,
  UserMetadataSchema,
} from './schemas/user-metadata.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: UserMetadata.name, schema: UserMetadataSchema },
    ]),
  ],
  controllers: [],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
