import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class FinalizeUploadDto {
  @IsString()
  @IsOptional()
  @IsNotEmpty()
  songId?: string;

  @IsString()
  @IsOptional()
  @IsNotEmpty()
  checksum?: string;
}
