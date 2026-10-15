import { IsInt, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class RoomCoinUserDto {
  @IsUUID()
  userId!: string;
}

export class DebitRoomMusicCoinDto extends RoomCoinUserDto {
  @Matches(/^[A-Za-z0-9:_-]{8,128}$/)
  requestId!: string;

  @IsString()
  @MaxLength(30)
  giftType!: string;

  @IsUUID()
  toUserId!: string;

  @IsInt()
  quantity!: number;
}
