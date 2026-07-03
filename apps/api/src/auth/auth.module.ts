import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { IDENTITY, resolveProtoPath } from '@musical/shared-proto';
import { JwtStrategy } from '../common/strategies/jwt.strategy';
import { StrictJwtAuthGuard } from '../common/guards/strict-jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';

@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: 'IDENTITY_PACKAGE',
        inject: [ConfigService],
        useFactory: (configService: ConfigService) => ({
          transport: Transport.GRPC,
          options: {
            package: IDENTITY.PACKAGE,
            protoPath: resolveProtoPath(IDENTITY.PROTO_FILE),
            url: configService.getOrThrow<string>('IDENTITY_GRPC_URL'),
            loader: { longs: Number },
          },
        }),
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, StrictJwtAuthGuard, PermissionsGuard],
  exports: [AuthService],
})
export class AuthModule {}
