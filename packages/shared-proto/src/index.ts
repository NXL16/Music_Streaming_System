export * from "./generated/identity_service";
export * from "./generated/song_service";
export * from "./generated/wallet_service";
export * from "./generated/recommendation_service";

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

export function resolveProtoPath(protoFile: string): string {
  return resolve(__dirname, "..", protoFile);
}
import { resolve } from "node:path";
