import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcryptjs';
import { User, UserDocument } from '../users/schemas/user.schema';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async register(registerDto: RegisterDto) {
    const { username, email, password, displayName } = registerDto;

    // Kiểm tra trùng lặp
    const existingUser = await this.userModel.findOne({
      $or: [{ email }, { username }],
    });
    if (existingUser) {
      if (existingUser.username === username)
        throw new ConflictException({
          code: 'AUTH_USERNAME_EXISTS',
          message: 'Username đã tồn tại',
        });
      if (existingUser.email === email)
        throw new ConflictException({
          code: 'AUTH_EMAIL_EXISTS',
          message: 'Email đã tồn tại',
        });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    const newUser = await this.userModel.create({
      username,
      email,
      password: hashedPassword,
      displayName,
    });

    return this.generateTokens(newUser);
  }

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;

    const user = await this.userModel.findOne({ username });
    if (!user) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Username hoặc password không đúng',
      });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException({
        code: 'AUTH_INVALID_CREDENTIALS',
        message: 'Username hoặc password không đúng',
      });
    }

    user.lastLoginAt = new Date();
    await user.save();

    return this.generateTokens(user);
  }

  private generateTokens(user: UserDocument) {
    const payload = { sub: user._id, username: user.username, role: user.role };

    const accessTokenExpires = this.configService.get<string>('JWT_EXPIRES_IN');
    const refreshTokenExpires = this.configService.get<string>(
      'JWT_REFRESH_EXPIRES_IN',
    );

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: accessTokenExpires as unknown as number,
    });

    const refreshToken = this.jwtService.sign(payload, {
      expiresIn: refreshTokenExpires as unknown as number,
    });

    return {
      accessToken,
      refreshToken,
      expiresIn: this.extractSeconds(accessTokenExpires as string),
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        createdAt: user.createdAt,
      },
    };
  }

  private extractSeconds(expiresIn: string): number {
    const multiplier: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1));
    return multiplier[unit] ? value * multiplier[unit] : parseInt(expiresIn);
  }
}
