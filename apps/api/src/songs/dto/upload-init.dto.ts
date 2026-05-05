import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UploadInitRequestDto {
  @IsString()
  @IsNotEmpty()
  title!: string;

  @IsString()
  @IsNotEmpty()
  artist!: string;

  @IsString()
  @IsOptional()
  album?: string;

  @IsString()
  @IsNotEmpty()
  uploaderId!: string;

  @IsBoolean()
  isPublic!: boolean;

  @IsString()
  @IsNotEmpty()
  fileName!: string;

  @IsNumber()
  @Min(1)
  fileSizeBytes!: number;

  @IsString()
  @IsNotEmpty()
  contentType!: string;
}
