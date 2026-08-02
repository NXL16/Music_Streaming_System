import { IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateRoomPlaybackTicketDto {
  @IsUUID()
  songId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  roomId!: string;

  @IsUUID()
  userId!: string;
}
