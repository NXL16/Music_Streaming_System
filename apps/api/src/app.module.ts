import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { SongsModule } from './songs/songs.module';
import { DatabaseModule } from './database/database.module';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { KmsModule } from './kms/kms.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    UsersModule,
    SongsModule,
    DatabaseModule,
    AuthModule,
    KmsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
