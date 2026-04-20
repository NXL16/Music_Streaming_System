import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Song, SongSchema } from '../../songs/schemas/song.schema';
import { CleanupService } from './cleanup.service';
import { CleanupController } from './cleanup.controller';
import { AuthModule } from '../../auth/auth.module';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Song.name, schema: SongSchema }]),
    AuthModule,
  ],
  providers: [CleanupService],
  controllers: [CleanupController],
  exports: [CleanupService],
})
export class CleanupModule {}
