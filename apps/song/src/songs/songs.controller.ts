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
  ListAudioAnalysisSongsRequest,
  ListAudioAnalysisSongsResponse,
  CreateSongRecordRequest,
  CreateSongRecordResponse,
  UpdateSongProcessingResultRequest,
  UpdateSongProcessingResultResponse,
  FavoriteRequest,
  FavoriteResponse,
  AlbumFavoriteRequest,
  AlbumFavoriteResponse,
  ListAlbumFavoriteIdsRequest,
  ListAlbumFavoriteIdsResponse,
  PlaylistFavoriteRequest,
  PlaylistFavoriteResponse,
  ListPlaylistFavoriteIdsRequest,
  ListPlaylistFavoriteIdsResponse,
  ListFavoriteSongsRequest,
  ListFavoriteSongsResponse,
  UpsertFavoriteArtworkRequest,
  FavoriteArtworkResponse,
  LibraryResourceRequest,
  LibraryResourceResponse,
  ListLibraryResourcesRequest,
  ListLibraryResourcesResponse,
  ListLibrarySongsRequest,
  ListLibrarySongsResponse,
  RemoveSongOwnershipRequest,
  RemoveSongOwnershipResponse,
  GetPlaylistRequest,
  GetPlaylistResponse,
  ListPlaylistTracksRequest,
  ListPlaylistTracksResponse,
  GetCatalogAlbumRequest,
  GetCatalogPlaylistRequest,
  UpsertSystemPlaylistRequest,
  GetCatalogResourcesRequest,
  GetCatalogArtistAlbumsRequest,
  GetCatalogArtistSongsRequest,
  GetCatalogArtistSongsResponse,
  GetCatalogSimilarArtistsRequest,
  GetCatalogSongVideosRequest,
  GetCatalogSongVideosResponse,
  GetCatalogAlbumSongVideosRequest,
  GetCatalogArtistSongVideosRequest,
  GetCatalogSongVideoRequest,
  GetCatalogRelatedSongVideosRequest,
  CatalogSongVideo,
  ResolveMusicVideoPlaybackRequest,
  ResolveMusicVideoPlaybackResponse,
  GetCatalogAlbumRelatedRequest,
  GetCatalogAlbumRelatedResponse,
  CatalogResponse,
  SaveCatalogArtistDraftRequest,
  SaveCatalogSongDraftRequest,
  SaveCatalogAlbumDraftRequest,
  SaveCatalogPlaylistDraftRequest,
  SaveCatalogSongVideoDraftRequest,
  CatalogDraftInfo,
  GetCatalogDraftRequest,
  CatalogDraftDetail,
  ListCatalogDraftsRequest,
  ListCatalogDraftsResponse,
  SubmitCatalogDraftRequest,
  ReviewCatalogDraftRequest,
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
  PlaylistSourceMembershipRequest,
  PlaylistSourceMembershipResponse,
  PlaylistTrackRequest,
  PlaylistTrackResponse,
  BrowseCatalogRequest,
  BrowseCatalogResponse,
  SearchCatalogRequest,
  SearchCatalogResponse,
  GetSongLyricsRequest,
  SongLyricsResponse,
  UpsertSongLyricsRequest,
  ListArtistWorkspacesRequest,
  ListArtistWorkspacesResponse,
  ListArtistMembersRequest,
  ListArtistMembersResponse,
  UpsertArtistMemberRequest,
  ArtistMembership,
  RemoveArtistMemberRequest,
  RemoveArtistMemberResponse,
  CheckArtistPermissionRequest,
  CheckArtistPermissionResponse,
} from '@musical/shared-proto';
import { CatalogService } from './catalog.service';
import { CatalogAuthoringService } from './catalog-authoring.service';
import { LyricsService } from './lyrics.service';
import { ArtistWorkspaceService } from './artist-workspace.service';

@Controller()
@SongServiceControllerMethods()
export class SongsController implements SongServiceController {
  constructor(
    private readonly songsService: SongsService,
    private readonly catalogService: CatalogService,
    private readonly catalogAuthoringService: CatalogAuthoringService,
    private readonly lyricsService: LyricsService,
    private readonly artistWorkspaceService: ArtistWorkspaceService,
  ) {}

  async getSong(request: GetSongRequest): Promise<GetSongResponse> {
    return this.songsService.getSong(request);
  }

  async getSongByChecksum(
    request: GetSongByChecksumRequest,
  ): Promise<GetSongByChecksumResponse> {
    return this.songsService.getSongByChecksum(request);
  }

  getSongLyrics(request: GetSongLyricsRequest): Promise<SongLyricsResponse> {
    return this.lyricsService.get(request);
  }

  upsertSongLyrics(
    request: UpsertSongLyricsRequest,
  ): Promise<SongLyricsResponse> {
    return this.lyricsService.upsert(request);
  }

  async getSongIngestInfo(
    request: GetSongIngestInfoRequest,
  ): Promise<GetSongIngestInfoResponse> {
    return this.songsService.getSongIngestInfo(request);
  }

  async listSongs(request: ListSongsRequest): Promise<ListSongsResponse> {
    return this.songsService.listSongs(request);
  }

  async listAudioAnalysisSongs(
    request: ListAudioAnalysisSongsRequest,
  ): Promise<ListAudioAnalysisSongsResponse> {
    return this.songsService.listAudioAnalysisSongs(request);
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

  addAlbumFavorite(request: AlbumFavoriteRequest): Promise<AlbumFavoriteResponse> {
    return this.songsService.addAlbumFavorite(request);
  }

  removeAlbumFavorite(request: AlbumFavoriteRequest): Promise<AlbumFavoriteResponse> {
    return this.songsService.removeAlbumFavorite(request);
  }

  getAlbumFavorite(request: AlbumFavoriteRequest): Promise<AlbumFavoriteResponse> {
    return this.songsService.getAlbumFavorite(request);
  }

  listAlbumFavoriteIds(
    request: ListAlbumFavoriteIdsRequest,
  ): Promise<ListAlbumFavoriteIdsResponse> {
    return this.songsService.listAlbumFavoriteIds(request);
  }

  addPlaylistFavorite(
    request: PlaylistFavoriteRequest,
  ): Promise<PlaylistFavoriteResponse> {
    return this.songsService.addPlaylistFavorite(request);
  }

  removePlaylistFavorite(
    request: PlaylistFavoriteRequest,
  ): Promise<PlaylistFavoriteResponse> {
    return this.songsService.removePlaylistFavorite(request);
  }

  getPlaylistFavorite(
    request: PlaylistFavoriteRequest,
  ): Promise<PlaylistFavoriteResponse> {
    return this.songsService.getPlaylistFavorite(request);
  }

  listPlaylistFavoriteIds(
    request: ListPlaylistFavoriteIdsRequest,
  ): Promise<ListPlaylistFavoriteIdsResponse> {
    return this.songsService.listPlaylistFavoriteIds(request);
  }

  async listFavoriteSongs(
    request: ListFavoriteSongsRequest,
  ): Promise<ListFavoriteSongsResponse> {
    return this.songsService.listFavoriteSongs(request);
  }

  upsertFavoriteArtwork(
    request: UpsertFavoriteArtworkRequest,
  ): Promise<FavoriteArtworkResponse> {
    return this.songsService.upsertFavoriteArtwork(request);
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

  async listLibrarySongs(
    request: ListLibrarySongsRequest,
  ): Promise<ListLibrarySongsResponse> {
    return this.songsService.listLibrarySongs(request);
  }
  async removeLibraryResource(
    request: LibraryResourceRequest,
  ): Promise<LibraryResourceResponse> {
    return this.songsService.removeLibraryResource(request);
  }

  async pinLibraryResource(
    request: LibraryResourceRequest,
  ): Promise<LibraryResourceResponse> {
    return this.songsService.pinLibraryResource(request);
  }

  async unpinLibraryResource(
    request: LibraryResourceRequest,
  ): Promise<LibraryResourceResponse> {
    return this.songsService.unpinLibraryResource(request);
  }

  async removeSongOwnership(
    request: RemoveSongOwnershipRequest,
  ): Promise<RemoveSongOwnershipResponse> {
    return this.songsService.removeSongOwnership(request);
  }

  async getPlaylist(request: GetPlaylistRequest): Promise<GetPlaylistResponse> {
    return this.songsService.getPlaylist(request);
  }

  async listPlaylistTracks(
    request: ListPlaylistTracksRequest,
  ): Promise<ListPlaylistTracksResponse> {
    return this.songsService.listPlaylistTracks(request);
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
    const data: {
      name?: string;
      description?: string;
      isPublic?: boolean;
      coverUrl?: string;
    } = {};
    if (request.hasName) data.name = request.name;
    if (request.hasDescription) data.description = request.description;
    if (request.hasIsPublic) data.isPublic = request.isPublic;
    if (request.hasCoverUrl) data.coverUrl = request.coverUrl;

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

  async getPlaylistSourceMembership(
    request: PlaylistSourceMembershipRequest,
  ): Promise<PlaylistSourceMembershipResponse> {
    return this.songsService.getPlaylistSourceMembership(
      request.userId,
      request.songIds,
    );
  }

  async addTrackToPlaylist(
    request: PlaylistTrackRequest,
  ): Promise<PlaylistTrackResponse> {
    return this.songsService.addTrackToPlaylist(
      request.userId,
      request.playlistId,
      request.songId,
      request.sourceAlbumId,
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

  async upsertSystemPlaylist(
    request: UpsertSystemPlaylistRequest,
  ): Promise<CatalogResponse> {
    return this.catalogService.upsertSystemPlaylist(request);
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

  async getCatalogSimilarArtists(
    request: GetCatalogSimilarArtistsRequest,
  ): Promise<CatalogResponse> {
    return this.catalogService.getSimilarArtists(request);
  }

  getCatalogSongVideos(
    request: GetCatalogSongVideosRequest,
  ): Promise<GetCatalogSongVideosResponse> {
    return this.catalogService.getSongVideos(request);
  }

  getCatalogSongVideo(
    request: GetCatalogSongVideoRequest,
  ): Promise<CatalogSongVideo> {
    return this.catalogService.getSongVideo(request);
  }

  getCatalogRelatedSongVideos(
    request: GetCatalogRelatedSongVideosRequest,
  ): Promise<GetCatalogSongVideosResponse> {
    return this.catalogService.getRelatedSongVideos(request);
  }

  getCatalogAlbumSongVideos(
    request: GetCatalogAlbumSongVideosRequest,
  ): Promise<GetCatalogSongVideosResponse> {
    return this.catalogService.getAlbumSongVideos(request);
  }

  getCatalogArtistSongVideos(
    request: GetCatalogArtistSongVideosRequest,
  ): Promise<GetCatalogSongVideosResponse> {
    return this.catalogService.getArtistSongVideos(request);
  }

  resolveMusicVideoPlayback(
    request: ResolveMusicVideoPlaybackRequest,
  ): Promise<ResolveMusicVideoPlaybackResponse> {
    return this.catalogService.resolveMusicVideoPlayback(request);
  }

  async getCatalogAlbumRelated(
    request: GetCatalogAlbumRelatedRequest,
  ): Promise<GetCatalogAlbumRelatedResponse> {
    return this.catalogService.getAlbumRelated(request);
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

  saveCatalogSongVideoDraft(
    request: SaveCatalogSongVideoDraftRequest,
  ): Promise<CatalogDraftInfo> {
    return this.catalogAuthoringService.saveSongVideoDraft(request);
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

  submitCatalogDraft(
    request: SubmitCatalogDraftRequest,
  ): Promise<CatalogDraftInfo> {
    return this.catalogAuthoringService.submitDraft(request);
  }

  reviewCatalogDraft(
    request: ReviewCatalogDraftRequest,
  ): Promise<CatalogDraftInfo> {
    return this.catalogAuthoringService.reviewDraft(request);
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

  listArtistWorkspaces(
    request: ListArtistWorkspacesRequest,
  ): Promise<ListArtistWorkspacesResponse> {
    return this.artistWorkspaceService.listWorkspaces(request);
  }

  listArtistMembers(
    request: ListArtistMembersRequest,
  ): Promise<ListArtistMembersResponse> {
    return this.artistWorkspaceService.listMembers(request);
  }

  upsertArtistMember(
    request: UpsertArtistMemberRequest,
  ): Promise<ArtistMembership> {
    return this.artistWorkspaceService.upsertMember(request);
  }

  removeArtistMember(
    request: RemoveArtistMemberRequest,
  ): Promise<RemoveArtistMemberResponse> {
    return this.artistWorkspaceService.removeMember(request);
  }

  checkArtistPermission(
    request: CheckArtistPermissionRequest,
  ): Promise<CheckArtistPermissionResponse> {
    return this.artistWorkspaceService.checkPermission(request);
  }
}
