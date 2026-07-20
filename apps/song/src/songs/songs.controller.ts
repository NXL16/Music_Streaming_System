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
  ListFavoriteSongsRequest,
  ListFavoriteSongsResponse,
  LibraryResourceRequest,
  LibraryResourceResponse,
  ListLibraryResourcesRequest,
  ListLibraryResourcesResponse,
  RemoveSongOwnershipRequest,
  RemoveSongOwnershipResponse,
  GetPlaylistRequest,
  GetPlaylistResponse,
  GetCatalogAlbumRequest,
  GetCatalogPlaylistRequest,
  GetCatalogResourcesRequest,
  GetCatalogArtistAlbumsRequest,
  GetCatalogArtistSongsRequest,
  GetCatalogArtistSongsResponse,
  CatalogResponse,
  SaveCatalogArtistDraftRequest,
  SaveCatalogSongDraftRequest,
  SaveCatalogAlbumDraftRequest,
  SaveCatalogPlaylistDraftRequest,
  CatalogDraftInfo,
  GetCatalogDraftRequest,
  CatalogDraftDetail,
  ListCatalogDraftsRequest,
  ListCatalogDraftsResponse,
  PublishCatalogDraftRequest,
  DeleteCatalogDraftRequest,
  DeleteCatalogDraftResponse,
  CreateUserPlaylistRequest,
  UserPlaylistInfo,
  UpdateUserPlaylistRequest,
  DeleteUserPlaylistRequest,
  DeleteUserPlaylistResponse,
  ListUserPlaylistsRequest,
  ListUserPlaylistsResponse,
  PlaylistTrackRequest,
  PlaylistTrackResponse,
  BrowseCatalogRequest,
  BrowseCatalogResponse,
  SearchCatalogRequest,
  SearchCatalogResponse,
} from '@musical/shared-proto';
import { CatalogService } from './catalog.service';
import { CatalogAuthoringService } from './catalog-authoring.service';

@Controller()
@SongServiceControllerMethods()
export class SongsController implements SongServiceController {
  constructor(
    private readonly songsService: SongsService,
    private readonly catalogService: CatalogService,
    private readonly catalogAuthoringService: CatalogAuthoringService,
  ) {}

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

  async listFavoriteSongs(
    request: ListFavoriteSongsRequest,
  ): Promise<ListFavoriteSongsResponse> {
    return this.songsService.listFavoriteSongs(request);
  }

  async addLibraryResource(
    request: LibraryResourceRequest,
  ): Promise<LibraryResourceResponse> {
    return this.songsService.addLibraryResource(request);
  }
  async listLibraryResources(
    request: ListLibraryResourcesRequest,
  ): Promise<ListLibraryResourcesResponse> {
    return this.songsService.listLibraryResources(request);
  }
  async removeLibraryResource(request: LibraryResourceRequest): Promise<LibraryResourceResponse> { return this.songsService.removeLibraryResource(request); }

  async removeSongOwnership(
    request: RemoveSongOwnershipRequest,
  ): Promise<RemoveSongOwnershipResponse> {
    return this.songsService.removeSongOwnership(request);
  }

  async getPlaylist(request: GetPlaylistRequest): Promise<GetPlaylistResponse> {
    return this.songsService.getPlaylist(request);
  }

  async createUserPlaylist(
    request: CreateUserPlaylistRequest,
  ): Promise<UserPlaylistInfo> {
    return this.songsService.createUserPlaylist(
      request.userId,
      request.name,
      request.description,
      request.isPublic,
    );
  }

  async updateUserPlaylist(
    request: UpdateUserPlaylistRequest,
  ): Promise<UserPlaylistInfo> {
    const data: { name?: string; description?: string; isPublic?: boolean } =
      {};
    if (request.hasName) data.name = request.name;
    if (request.hasDescription) data.description = request.description;
    if (request.hasIsPublic) data.isPublic = request.isPublic;

    return this.songsService.updateUserPlaylist(
      request.userId,
      request.playlistId,
      data,
    );
  }

  async deleteUserPlaylist(
    request: DeleteUserPlaylistRequest,
  ): Promise<DeleteUserPlaylistResponse> {
    return this.songsService.deleteUserPlaylist(
      request.userId,
      request.playlistId,
    );
  }

  async listUserPlaylists(
    request: ListUserPlaylistsRequest,
  ): Promise<ListUserPlaylistsResponse> {
    return this.songsService.listUserPlaylists(
      request.userId,
      request.requesterUserId,
      request.limit,
      request.cursor,
    );
  }

  async addTrackToPlaylist(
    request: PlaylistTrackRequest,
  ): Promise<PlaylistTrackResponse> {
    return this.songsService.addTrackToPlaylist(
      request.userId,
      request.playlistId,
      request.songId,
    );
  }

  async removeTrackFromPlaylist(
    request: PlaylistTrackRequest,
  ): Promise<PlaylistTrackResponse> {
    return this.songsService.removeTrackFromPlaylist(
      request.userId,
      request.playlistId,
      request.songId,
    );
  }

  async getCatalogAlbum(
    request: GetCatalogAlbumRequest,
  ): Promise<CatalogResponse> {
    return this.catalogService.getAlbum(request);
  }

  async getCatalogPlaylist(
    request: GetCatalogPlaylistRequest,
  ): Promise<CatalogResponse> {
    return this.catalogService.getPlaylist(request);
  }

  async getCatalogPlaylistTracks(
    request: GetCatalogPlaylistRequest,
  ): Promise<CatalogResponse> {
    return this.catalogService.getPlaylistTracks(request);
  }

  async getCatalogResources(
    request: GetCatalogResourcesRequest,
  ): Promise<CatalogResponse> {
    return this.catalogService.getResources(request);
  }

  async getCatalogArtistAlbums(
    request: GetCatalogArtistAlbumsRequest,
  ): Promise<CatalogResponse> {
    return this.catalogService.getArtistAlbums(request);
  }

  async getCatalogArtistSongs(
    request: GetCatalogArtistSongsRequest,
  ): Promise<GetCatalogArtistSongsResponse> {
    return this.catalogService.getArtistSongs(request);
  }

  saveCatalogArtistDraft(
    request: SaveCatalogArtistDraftRequest,
  ): Promise<CatalogDraftInfo> {
    return this.catalogAuthoringService.saveArtistDraft(request);
  }

  saveCatalogSongDraft(
    request: SaveCatalogSongDraftRequest,
  ): Promise<CatalogDraftInfo> {
    return this.catalogAuthoringService.saveSongDraft(request);
  }

  saveCatalogAlbumDraft(
    request: SaveCatalogAlbumDraftRequest,
  ): Promise<CatalogDraftInfo> {
    return this.catalogAuthoringService.saveAlbumDraft(request);
  }

  saveCatalogPlaylistDraft(
    request: SaveCatalogPlaylistDraftRequest,
  ): Promise<CatalogDraftInfo> {
    return this.catalogAuthoringService.savePlaylistDraft(request);
  }

  getCatalogDraft(
    request: GetCatalogDraftRequest,
  ): Promise<CatalogDraftDetail> {
    return this.catalogAuthoringService.getDraft(request);
  }

  listCatalogDrafts(
    request: ListCatalogDraftsRequest,
  ): Promise<ListCatalogDraftsResponse> {
    return this.catalogAuthoringService.listDrafts(request);
  }

  publishCatalogDraft(
    request: PublishCatalogDraftRequest,
  ): Promise<CatalogResponse> {
    return this.catalogAuthoringService.publishDraft(request);
  }

  deleteCatalogDraft(
    request: DeleteCatalogDraftRequest,
  ): Promise<DeleteCatalogDraftResponse> {
    return this.catalogAuthoringService.deleteDraft(request);
  }

  async browseCatalog(
    request: BrowseCatalogRequest,
  ): Promise<BrowseCatalogResponse> {
    return this.catalogService.browseCatalog(request);
  }

  async searchCatalog(
    request: SearchCatalogRequest,
  ): Promise<SearchCatalogResponse> {
    return this.catalogService.searchCatalog(request);
  }
}
