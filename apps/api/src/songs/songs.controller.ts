import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { SongsService } from './songs.service';
import { GetSongsQueryDto } from './dto/get-songs-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('songs')
@UseGuards(JwtAuthGuard)
export class SongsController {
  constructor(private readonly songsService: SongsService) {}

  @Get()
  async getSongs(@Query() query: GetSongsQueryDto) {
    const data = await this.songsService.findAll(query);

    return {
      success: true,
      code: 'SONGS_LIST_SUCCESS',
      data,
      message: 'Lấy danh sách bài hát thành công',
      timestamp: new Date().toISOString(),
    };
  }

  @Get(':id')
  async getSongDetails(@Param('id') id: string) {
    const song = await this.songsService.findOne(id);

    return {
      success: true,
      code: 'SONG_DETAILS_SUCCESS',
      data: song,
      message: 'Lấy chi tiết bài hát thành công',
      timestamp: new Date().toISOString(),
    };
  }
}
