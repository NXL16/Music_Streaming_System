import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtPayload, JwtUser } from '@musical/shared-types';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  validate(payload: JwtPayload): JwtUser {
    // Payload là thông tin đã giải mã từ token (sub, username, role)
    if (!payload.sub) {
      throw new UnauthorizedException();
    }
    // Trả về thông tin user để gắn vào request.user
    return {
      userId: payload.sub,
      username: payload.username,
      role: payload.role,
      deviceId: payload.deviceId,
      tokenVersion: payload.tokenVersion,
      jti: payload.jti,
      exp: payload.exp,
    };
  }
}
