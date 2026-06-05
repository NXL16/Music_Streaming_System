import { IsNotEmpty, IsOptional, IsString, ValidateIf } from 'class-validator';

export class GoogleLoginDto {
  @ValidateIf((dto: GoogleLoginDto) => !dto.code && !dto.authorizationCode)
  @IsString()
  @IsNotEmpty()
  idToken?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  authorizationCode?: string;

  @IsOptional()
  @IsString()
  deviceId?: string;
}
