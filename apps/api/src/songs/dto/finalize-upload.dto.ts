import { IsString, IsOptional } from 'class-validator';

export class FinalizeUploadDto {
  @IsString()
  @IsOptional()
  songId?: string;

  @IsString()
  @IsOptional()
  checksum?: string;

  @IsString()
  @IsOptional()
  sourceObjectPath?: string;
}
