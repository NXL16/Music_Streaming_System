import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';

@Global()
@Module({
  imports: [
    MongooseModule.forRootAsync({
      useFactory: (configService: ConfigService) => ({
        uri: configService.getOrThrow<string>('MONGODB_URI'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [PrismaService],
  exports: [PrismaService],
})
export class DatabaseModule {}
