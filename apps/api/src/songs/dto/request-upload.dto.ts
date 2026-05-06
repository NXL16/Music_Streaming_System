import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

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
  checksum!: string;

  @IsNumber()
  @Min(1)
  size!: number;
}
