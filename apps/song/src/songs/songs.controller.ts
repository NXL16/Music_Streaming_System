import { Controller } from '@nestjs/common';
import { SongsService } from './songs.service';
import {
  SongServiceController,
  SongServiceControllerMethods,
  GetSongRequest,
  GetSongResponse,
  GetSongByChecksumRequest,
  GetSongByChecksumResponse,
  GetSongIngestInfoRequest,
  GetSongIngestInfoResponse,
  ListSongsRequest,
  ListSongsResponse,
  CreateSongRecordRequest,
  CreateSongRecordResponse,
  UpdateSongProcessingResultRequest,
  UpdateSongProcessingResultResponse,
  FavoriteRequest,
  FavoriteResponse,
  RemoveSongOwnershipRequest,
  RemoveSongOwnershipResponse,
  GetPlaylistRequest,
  GetPlaylistResponse,
} from '@musical/shared-proto';

@Controller()
@SongServiceControllerMethods()
export class SongsController implements SongServiceController {
  constructor(private readonly songsService: SongsService) {}

  async getSong(request: GetSongRequest): Promise<GetSongResponse> {
    return this.songsService.getSong(request);
  }

  async getSongByChecksum(
    request: GetSongByChecksumRequest,
  ): Promise<GetSongByChecksumResponse> {
    return this.songsService.getSongByChecksum(request);
  }

  async getSongIngestInfo(
    request: GetSongIngestInfoRequest,
  ): Promise<GetSongIngestInfoResponse> {
    return this.songsService.getSongIngestInfo(request);
  }

  async listSongs(request: ListSongsRequest): Promise<ListSongsResponse> {
    return this.songsService.listSongs(request);
  }

  async createSongRecord(
    request: CreateSongRecordRequest,
  ): Promise<CreateSongRecordResponse> {
    return this.songsService.createSongRecord(request);
  }

  async updateSongProcessingResult(
    request: UpdateSongProcessingResultRequest,
  ): Promise<UpdateSongProcessingResultResponse> {
    return this.songsService.updateSongProcessingResult(request);
  }

  async addFavorite(request: FavoriteRequest): Promise<FavoriteResponse> {
    return this.songsService.addFavorite(request);
  }

  async removeFavorite(request: FavoriteRequest): Promise<FavoriteResponse> {
    return this.songsService.removeFavorite(request);
  }

  async removeSongOwnership(
    request: RemoveSongOwnershipRequest,
  ): Promise<RemoveSongOwnershipResponse> {
    return this.songsService.removeSongOwnership(request);
  }

  async getPlaylist(request: GetPlaylistRequest): Promise<GetPlaylistResponse> {
    return this.songsService.getPlaylist(request);
  }
}
