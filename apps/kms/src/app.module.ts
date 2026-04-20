import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { KeyManagementModule } from './key-management/key-management.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    KeyManagementModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
