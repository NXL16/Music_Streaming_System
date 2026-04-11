import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as crypto from 'crypto';
import { Key } from '../database/entities/key.entity';

@Injectable()
export class KeyManagementService {
  private readonly logger = new Logger(KeyManagementService.name);

  constructor(
    @InjectRepository(Key)
    private readonly keyRepository: Repository<Key>,
  ) {}

  async generateKey(data: { song_id: string; user_id: string }) {
    // 1. Kiểm tra xem bài hát này đã có khóa chưa (tránh tạo trùng)
    const existingKey = await this.keyRepository.findOne({
      where: { songId: data.song_id, isActive: true },
    });

    if (existingKey) {
      this.logger.log(`Key already exists for song: ${data.song_id}`);
      return {
        key_id: existingKey.id.toString(),
        key: existingKey.keyBinary, // Trả về Buffer
        iv: Buffer.from(existingKey.iv, 'hex'), // Parse từ Hex string sang Buffer
      };
    }

    // 2. Sinh khóa AES-128 (16 bytes = 128 bits)
    const keyBuffer = crypto.randomBytes(16);
    const ivBuffer = crypto.randomBytes(16);
    const ivHex = ivBuffer.toString('hex'); // Lưu IV dưới dạng Hex cho dễ đọc trong DB

    // 3. Lưu vào Database
    const newKey = this.keyRepository.create({
      songId: data.song_id,
      keyBinary: keyBuffer,
      iv: ivHex,
      version: 1,
      isActive: true,
    });

    await this.keyRepository.save(newKey);
    this.logger.log(`Generated new AES-128 key for song: ${data.song_id}`);

    // 4. Trả về đúng format được định nghĩa trong file .proto
    return {
      key_id: newKey.id.toString(),
      key: keyBuffer,
      iv: ivBuffer,
    };
  }

  async getKey(data: {
    song_id: string;
    user_id: string;
    device_fingerprint?: string;
  }) {
    // *Ghi chú: Tại đây sau này bạn có thể ghi Audit Log (Lịch sử truy cập khóa) vào database

    const keyRecord = await this.keyRepository.findOne({
      where: { songId: data.song_id, isActive: true },
    });

    if (!keyRecord) {
      this.logger.error(`Key not found for song: ${data.song_id}`);
      throw new Error('Key not found'); // Trong gRPC, throw Error sẽ trả về mã RpcException
    }

    return {
      key: keyRecord.keyBinary,
      iv: Buffer.from(keyRecord.iv, 'hex'),
    };
  }
}
