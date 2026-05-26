// ========== IDENTITY PROTO ============
export type {
  SignUpRequest,
  LoginRequest,
  RefreshTokenRequest,
  LogoutRequest,
  LogoutAllRequest,
  ListUserSessionsRequest,
  ListUserSessionsResponse,
  LogoutDeviceRequest,
  GetProfileRequest,
  UpdateProfileRequest,
  ChangePasswordRequest,
  ListUsersRequest,
  ListUsersResponse,
  SetUserStatusRequest,
  RequestPasswordResetRequest,
  ResetPasswordRequest,
  RequestEmailVerificationRequest,
  VerifyEmailRequest,
  TokenIssueResponse,
  BeginTwoFactorSetupRequest,
  BeginTwoFactorSetupResponse,
  ConfirmTwoFactorSetupRequest,
  ConfirmTwoFactorSetupResponse,
  DisableTwoFactorRequest,
  RegenerateTwoFactorRecoveryCodesRequest,
  TwoFactorRecoveryCodesResponse,
  VerifyTwoFactorLoginRequest,
  AuthResponse,
  UserProfile,
  EmptyResponse,
  IdentityServiceClient,
  IdentityServiceController,
  AdminUserActionRequest,
} from "./generated/identity_service";

export const IDENTITY = {
  PACKAGE: "identity_service",
  SERVICE: "IdentityService",
  PROTO_FILE: "identity_service.proto",
};

// ========== SONG PROTO ============
export type {
  SongSummary,
  SongDetail,
  SongIngestInfo,
  Playlist,
  GetSongRequest,
  GetSongResponse,
  GetSongByChecksumRequest,
  GetSongByChecksumResponse,
  GetSongIngestInfoRequest,
  GetSongIngestInfoResponse,
  FavoriteRequest,
  ListSongsRequest,
  FavoriteResponse,
  SongServiceClient,
  ListSongsResponse,
  GetPlaylistRequest,
  GetPlaylistResponse,
  SongServiceController,
  CreateSongRecordRequest,
  CreateSongRecordResponse,
  UpdateSongProcessingResultRequest,
  UpdateSongProcessingResultResponse,
} from "./generated/song_service";

import { GrpcMethod, GrpcStreamMethod } from "@nestjs/microservices";

export function SongServiceControllerMethods() {
  return function (constructor: Function) {
    const grpcMethods: string[] = [
      "getSong",
      "getSongByChecksum",
      "getSongIngestInfo",
      "listSongs",
      "createSongRecord",
      "updateSongProcessingResult",
      "addFavorite",
      "removeFavorite",
      "getPlaylist",
    ];
    for (const method of grpcMethods) {
      const descriptor: any = Reflect.getOwnPropertyDescriptor(
        constructor.prototype,
        method,
      );
      GrpcMethod("SongService", method)(
        constructor.prototype[method],
        method,
        descriptor,
      );
    }
    const grpcStreamMethods: string[] = [];
    for (const method of grpcStreamMethods) {
      const descriptor: any = Reflect.getOwnPropertyDescriptor(
        constructor.prototype,
        method,
      );
      GrpcStreamMethod("SongService", method)(
        constructor.prototype[method],
        method,
        descriptor,
      );
    }
  };
}

export const SongStatus = {
  SONG_STATUS_UNSPECIFIED: 0,
  SONG_STATUS_PENDING: 1,
  SONG_STATUS_PROCESSING: 2,
  SONG_STATUS_READY: 3,
  SONG_STATUS_FAILED: 4,
  UNRECOGNIZED: -1,
} as const;
export type SongStatus = (typeof SongStatus)[keyof typeof SongStatus];

export const SONG = {
  PACKAGE: "song_service",
  SERVICE: "SongService",
  PROTO_FILE: "song_service.proto",
};

// ========== METADATA PROTO ============
export type {
  SeekPoint,
  UpdateMetaRequest,
  GetStreamDataRequest,
  StreamDataResponse,
  EmptyResponse as MetadataEmptyResponse,
  MetadataServiceClient,
  MetadataServiceController,
} from "./generated/metadata_service";

export const METADATA = {
  PACKAGE: "metadata_service",
  SERVICE: "MetadataService",
  PROTO_FILE: "metadata_service.proto",
};
