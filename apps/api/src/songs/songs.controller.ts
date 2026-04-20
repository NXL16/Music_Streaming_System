import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpException,
  InternalServerErrorException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { SongsService } from './songs.service';
import { GetSongsQueryDto } from './dto/get-songs-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import * as fs from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import type { Request, Response } from 'express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { UploadSongDto } from './dto/upload-song.dto';

const uploadDir = join(process.cwd(), 'uploads', 'temp');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const allowedAudioMimeTypes = new Set([
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/x-wav',
  'audio/vnd.wave',
  'audio/flac',
  'audio/x-flac',
  'audio/ogg',
]);

@Controller('songs')
@UseGuards(JwtAuthGuard)
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  private async removeTempFile(file?: Express.Multer.File): Promise<void> {
    if (file?.path && fs.existsSync(file.path)) {
      await fs.promises.unlink(file.path).catch(() => {});
    }
  }

  private async validateAudioSignature(filePath: string): Promise<boolean> {
    try {
      const fileHandle = await fs.promises.open(filePath, 'r');
      const header = Buffer.alloc(16);
      const { bytesRead } = await fileHandle.read(header, 0, header.length, 0);
      await fileHandle.close();

      if (bytesRead < 4) {
        return false;
      }

      const isMp3Id3 =
        header[0] === 0x49 && header[1] === 0x44 && header[2] === 0x33;
      const isMp3FrameSync = header[0] === 0xff && (header[1] & 0xe0) === 0xe0;
      const isWav =
        bytesRead >= 12 &&
        header.toString('ascii', 0, 4) === 'RIFF' &&
        header.toString('ascii', 8, 12) === 'WAVE';
      const isFlac = header.toString('ascii', 0, 4) === 'fLaC';
      const isOgg = header.toString('ascii', 0, 4) === 'OggS';

      return isMp3Id3 || isMp3FrameSync || isWav || isFlac || isOgg;
    } catch {
      return false;
    }
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @Get()
  async getSongs(@Query() query: GetSongsQueryDto) {
    const data = await this.songsService.findAll(query);
    return {
      success: true,
      code: 'SONGS_LIST_SUCCESS',
      data,
      message: 'Lấy danh sách bài hát thành công.',
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 100, ttl: 60000 } })
  @Get(':id')
  async getSongDetails(@Param('id') id: string, @Req() req: Request) {
    const user = req.user as { userId: string };
    const song = await this.songsService.findOne(id, user.userId);
    return {
      success: true,
      code: 'SONG_DETAILS_SUCCESS',
      data: song,
      message: 'Lấy chi tiết bài hát thành công.',
      timestamp: new Date().toISOString(),
    };
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (req, file, cb) => {
          // Tạo tên file duy nhất tránh trùng lặp: timestamp-random.mp3
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),

      fileFilter: (req, file, cb) => {
        if (!allowedAudioMimeTypes.has(file.mimetype)) {
          return cb(
            new BadRequestException({
              success: false,
              code: 'INVALID_FILE_TYPE',
              message: 'Chỉ chấp nhận định dạng âm thanh (mp3, wav, flac...)',
              timestamp: new Date().toISOString(),
            }),
            false,
          );
        }
        cb(null, true);
      },
      limits: { fileSize: 50 * 1024 * 1024 }, // Max 50MB
    }),
  )
  async uploadSong(
    @UploadedFile() file: Express.Multer.File,
    @Body() uploadSongDto: UploadSongDto,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException({
        success: false,
        code: 'NO_FILE',
        message: 'Không tìm thấy file đính kèm.',
        timestamp: new Date().toISOString(),
      });
    }

    const { title, isPublic = false } = uploadSongDto;

    const user = req.user as { userId: string };
    const userId = user.userId;

    const hasValidAudioSignature = await this.validateAudioSignature(file.path);
    if (!hasValidAudioSignature) {
      await this.removeTempFile(file);
      throw new BadRequestException({
        success: false,
        code: 'INVALID_FILE_CONTENT',
        message: 'Nội dung file không hợp lệ hoặc không phải file âm thanh.',
        timestamp: new Date().toISOString(),
      });
    }

    try {
      const result = await this.songsService.uploadSong(
        file,
        userId,
        title,
        isPublic,
      );
      return {
        success: true,
        code: result.isDuplicate ? 'SONG_DUPLICATE' : 'SONG_PROCESSING',
        data: result.song,
        message: result.isDuplicate
          ? 'Bài hát đã tồn tại, sử dụng lại dữ liệu có sẵn'
          : 'Tải lên thành công, bài hát đang được xử lý',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      await this.removeTempFile(file);

      if (error instanceof HttpException) {
        throw error;
      }

      throw new InternalServerErrorException({
        success: false,
        code: 'SONG_UPLOAD_FAILED',
        message: 'Hệ thống xử lý tải lên đang bận. Vui lòng thử lại sau.',
        timestamp: new Date().toISOString(),
      });
    }
  }

  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 req/min - high value endpoint
  @Get(':id/key')
  async getSongKey(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const user = req.user as { userId: string };
    const userAgent = req.headers['user-agent'];
    const deviceFingerprint = Array.isArray(userAgent)
      ? userAgent.join('|')
      : (userAgent ?? 'unknown-device');

    const keyBuffer = await this.songsService.getSongDecryptionKey(
      id,
      user.userId,
      deviceFingerprint,
    );

    res.setHeader('Content-Type', 'application/octet-stream');
    res.send(keyBuffer);
  }
}
