import { IsIn, IsInt, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class AvatarUploadDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  filename!: string;

  @IsIn(['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
  contentType!: string;

  @IsString()
  @Matches(/^[a-f0-9]{64}$/i, { message: 'Checksum phải là SHA-256 dạng hex' })
  checksum!: string;

  @IsInt()
  @Min(1)
  @Max(5 * 1024 * 1024)
  sizeBytes!: number;
}
