import { IsString, IsOptional } from 'class-validator';

export class FinalizeUploadDto {
  @IsString()
  @IsOptional()
  songId?: string;

  @IsString()
  @IsOptional()
  song_id?: string;

  @IsString()
  @IsOptional()
  checksum?: string;
}
