import {
  IsBoolean,
  IsHexadecimal,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

const MAX_UPLOAD_SIZE_BYTES = 100 * 1024 * 1024;

export class RequestUploadDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsOptional()
  @IsString()
  artist?: string;

  @IsOptional()
  @IsString()
  album?: string;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @IsString()
  @IsNotEmpty()
  @IsHexadecimal()
  @Length(64, 64)
  checksum!: string;

  @IsNumber()
  @Min(1)
  @Max(MAX_UPLOAD_SIZE_BYTES)
  size!: number;
}
