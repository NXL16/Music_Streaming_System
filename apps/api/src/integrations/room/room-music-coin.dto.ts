import {
  IsIn,
  IsInt,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

export class RoomCoinUserDto {
  @IsUUID()
  userId!: string;
}

export class CreateRoomTopUpDto extends RoomCoinUserDto {
  @IsIn(['10000', '20000', '50000', '100000', '200000', '500000'])
  packageId!: string;

  @IsIn(['MOMO', 'NFBANK'])
  paymentMethod!: 'MOMO' | 'NFBANK';
}

export class RoomTopUpStatusDto extends RoomCoinUserDto {
  @Matches(/^(MOMO|NFBANK)-[0-9a-f]{32}$/)
  orderId!: string;
}

export class CreditRoomMusicCoinDto extends RoomCoinUserDto {
  @Matches(/^room-credit:[0-9a-f]{24}$/)
  requestId!: string;

  @Matches(/^TX-DEBIT-[0-9a-fA-F-]{36}$/)
  debitTransactionId!: string;

  @IsUUID()
  fromUserId!: string;

  @IsString()
  @MaxLength(30)
  giftType!: string;

  @IsInt()
  quantity!: number;
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
