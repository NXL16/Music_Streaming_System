import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';

@Entity('keys')
@Unique('uk_song_version', ['songId', 'version']) // Một bài hát chỉ có 1 version khóa active tại 1 thời điểm
export class Key {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'song_id', type: 'varchar', length: 36 })
  @Index('idx_song_id')
  songId!: string;

  @Column({ name: 'key_binary', type: 'blob' })
  keyBinary!: Buffer; // Lưu trữ 16 bytes nhị phân của khóa AES-128

  @Column({ type: 'varchar', length: 32 })
  iv!: string; // Hex-encoded Initialization Vector (IV)

  @Column({ type: 'int', default: 1 })
  @Index('idx_version')
  version!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  @Index('idx_is_active')
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  @Index('idx_created_at')
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  @Index('idx_expires_at')
  expiresA!: Date;

  @Column({ name: 'rotated_at', type: 'timestamp', nullable: true })
  rotatedAt!: Date;
}
