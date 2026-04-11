import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Song, SongDocument } from './schemas/song.schema';
import { GetSongsQueryDto } from './dto/get-songs-query.dto';

@Injectable()
export class SongsService {
  constructor(
    @InjectModel(Song.name)
    private readonly songModel: Model<SongDocument>,
  ) {}

  async findAll(queryDto: GetSongsQueryDto) {
    const { cursor, limit, genre, search } = queryDto;

    const safeLimit = Math.min(limit ?? 20, 50);

    const filter: Record<string, unknown> = {
      isPublic: true,
    };

    if (genre) {
      filter.genre = genre;
    }

    if (search) {
      filter.title = { $regex: search, $options: 'i' };
    }

    if (cursor) {
      filter._id = { $lt: new Types.ObjectId(cursor) };
    }

    const songs = await this.songModel
      .find(filter)
      .sort({ _id: -1 })
      .limit(safeLimit + 1) // lấy dư 1 record
      .lean()
      .exec();

    const hasMore = songs.length > safeLimit;

    if (hasMore) {
      songs.pop();
    }

    const nextCursor =
      songs.length > 0 ? songs[songs.length - 1]._id.toString() : null;

    return {
      songs,
      pagination: {
        nextCursor,
        limit: safeLimit,
        hasMore,
      },
    };
  }

  async findOne(id: string) {
    const song = await this.songModel.findById(id).lean().exec();

    if (!song) {
      throw new NotFoundException({
        code: 'SONG_NOT_FOUND',
        message: 'Bài hát không tồn tại',
      });
    }

    return song;
  }
}
