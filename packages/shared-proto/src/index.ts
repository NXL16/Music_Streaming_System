// ========== IDENTITY PROTO ============
export type {
  SignUpRequest,
  LoginRequest,
  LoginWithGoogleRequest,
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
  SetUserRoleRequest,
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
  RemoveSongOwnershipRequest,
  RemoveSongOwnershipResponse,
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
      "removeSongOwnership",
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

// ========== WALLET PROTO ============
export type {
  WalletServiceClient,
  DepositOrderRequest,
  DepositOrderResponse,
  GetBalanceResponse,
} from "./generated/wallet_service";

export const WALLET = {
  PACKAGE: "wallet_service",
  SERVICE: "WalletService",
  PROTO_FILE: "wallet_service.proto",
};

// ========== RECOMMENDATION PROTO ============
export type {
  GetHomeRecommendationsRequest,
  GetRecommendationSectionRequest,
  RefreshRecommendationSectionRequest,
  ReplaceHomeRecommendationsRequest,
  GetHomeRecommendationsResponse,
  RecommendationRef,
  RecommendationRelationship,
  RecommendationRelationships,
  RecommendationDisplay,
  DisplayTitle,
  PersonalRecommendationAttributes,
  PersonalRecommendationResource,
  CatalogResource,
  RecommendationResources,
  RecommendationMeta,
  RecommendationServiceClient,
  RecommendationServiceController,
} from "./generated/recommendation_service";

export function RecommendationServiceControllerMethods() {
  return function (constructor: Function) {
    const grpcMethods: string[] = [
      "getHomeRecommendations",
      "getRecommendationSection",
      "refreshRecommendationSection",
      "replaceHomeRecommendations",
    ];
    for (const method of grpcMethods) {
      const descriptor: any = Reflect.getOwnPropertyDescriptor(
        constructor.prototype,
        method,
      );
      GrpcMethod("RecommendationService", method)(
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
      GrpcStreamMethod("RecommendationService", method)(
        constructor.prototype[method],
        method,
        descriptor,
      );
    }
  };
}

export const RECOMMENDATION = {
  PACKAGE: "recommendation_service",
  SERVICE: "RecommendationService",
  PROTO_FILE: "recommendation_service.proto",
};
