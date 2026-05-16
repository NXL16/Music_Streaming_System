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

  @IsString()
  @IsOptional()
  sourceObjectPath?: string;

  @IsString()
  @IsOptional()
  source_object_path?: string;
}
