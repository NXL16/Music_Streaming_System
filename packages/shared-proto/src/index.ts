import { resolve } from "node:path";

export * from "./generated/identity_service";
export * from "./generated/song_service";
export * from "./generated/wallet_service";
export * from "./generated/recommendation_service";
export * from "./generated/asset_service";

export {
  type SeekPoint,
  type UpdateMetaRequest,
  type GetStreamDataRequest,
  type StreamDataResponse,
  type MetadataServiceClient,
  type MetadataServiceController,
  MetadataServiceControllerMethods,
  EmptyResponse as MetadataEmptyResponse,
} from "./generated/metadata_service";

export type {
  Struct as ProtobufStruct,
  Value as ProtobufValue,
} from "./generated/google/protobuf/struct";

export const IDENTITY = {
  PACKAGE: "identity_service",
  SERVICE: "IdentityService",
  PROTO_FILE: "identity_service.proto",
} as const;

export const SONG = {
  PACKAGE: "song_service",
  SERVICE: "SongService",
  PROTO_FILE: "song_service.proto",
} as const;

export const METADATA = {
  PACKAGE: "metadata_service",
  SERVICE: "MetadataService",
  PROTO_FILE: "metadata_service.proto",
} as const;

export const WALLET = {
  PACKAGE: "wallet_service",
  SERVICE: "WalletService",
  PROTO_FILE: "wallet_service.proto",
} as const;

export const RECOMMENDATION = {
  PACKAGE: "recommendation_service",
  SERVICE: "RecommendationService",
  PROTO_FILE: "recommendation_service.proto",
} as const;

export const ASSET = {
  PACKAGE: "asset_service",
  SERVICE: "AssetService",
  PROTO_FILE: "asset_service.proto",
} as const;

export const GRPC_LOADER_OPTIONS = {
  arrays: true,
  objects: true,
  longs: Number,
} as const;

export function resolveProtoPath(protoFile: string): string {
  return resolve(__dirname, "..", protoFile);
}
