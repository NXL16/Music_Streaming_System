import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { StreamController } from './stream.controller';
import { StreamService } from './stream.service';

@Module({
  imports: [ConfigModule],
  controllers: [StreamController],
  providers: [StreamService],
})
export class StreamModule {}
