import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { PrismaPg } from "@prisma/adapter-pg";
import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";
import { PrismaClient as AssetPrismaClient } from "../generated/prisma/client";
import {
  Prisma as SongPrisma,
  PrismaClient as SongPrismaClient,
} from "../../../song/src/generated/prisma/client";
import {
  artworkPaletteFromColor,
  deriveArtworkPalette,
  type ArtworkPalette,
} from "../processing/artwork-theme";

type JsonRecord = Record<string, unknown>;

function usage(): never {
  throw new Error(
    "Usage: pnpm artwork:theme:refresh -- --asset <assetId> [--color #rrggbb] [--dry-run] | --album <albumId> [--color #rrggbb] [--dry-run] | --playlist <playlistId> [--color #rrggbb] [--dry-run]",
  );
}

function options() {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1]?.trim() : undefined;
  };
  const assetId = value("--asset");
  const albumId = value("--album");
  const playlistId = value("--playlist");
  const color = value("--color");
  if ([assetId, albumId, playlistId].filter(Boolean).length !== 1) usage();
  if (color && !/^#?[0-9a-f]{6}$/i.test(color)) usage();
  return {
    assetId,
    albumId,
    playlistId,
    color,
    dryRun: args.includes("--dry-run"),
  };
}

function envAt(path: string): NodeJS.ProcessEnv {
  const target: NodeJS.ProcessEnv = {};
  loadEnv({ path, processEnv: target, quiet: true });
  return target;
}

function required(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is missing from the required .env file`);
  return value;
}

function object(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as JsonRecord) }
    : {};
}

function applyPalette(value: unknown, palette: ArtworkPalette): JsonRecord {
  const artwork = object(value);
  const variants = object(artwork.variants);
  return {
    ...artwork,
    bgColor: palette.bgColor,
    textColor1: palette.textColor1,
    textColor2: palette.textColor2,
    textColor3: palette.textColor3,
    textColor4: palette.textColor4,
    hasP3: palette.hasP3,
    variants: { ...variants, palette },
  };
}

function applyEditorialPalette(
  value: unknown,
  palette: ArtworkPalette,
): JsonRecord {
  const editorialArtwork = object(value);
  return {
    ...editorialArtwork,
    primary: applyPalette(editorialArtwork.primary, palette),
  };
}

async function getSource(
  asset: { sourceObjectKey: string },
  env: NodeJS.ProcessEnv,
): Promise<Buffer> {
  const client = new S3Client({
    region: "auto",
    endpoint: required(env, "R2_ENDPOINT"),
    credentials: {
      accessKeyId: required(env, "R2_ACCESS_KEY"),
      secretAccessKey: required(env, "R2_SECRET_KEY"),
    },
    forcePathStyle: true,
  });
  const result = await client.send(
    new GetObjectCommand({
      Bucket: required(env, "R2_BUCKET"),
      Key: asset.sourceObjectKey,
    }),
  );
  if (!result.Body) throw new Error("ARTWORK_SOURCE_MISSING");
  return Buffer.from(await result.Body.transformToByteArray());
}

async function main() {
  const {
    assetId: requestedAssetId,
    albumId,
    playlistId,
    color,
    dryRun,
  } = options();
  const workspaceRoot = resolve(process.cwd(), "../..");
  const assetEnv = envAt(resolve(workspaceRoot, "apps/asset/.env"));
  const songEnv = envAt(resolve(workspaceRoot, "apps/song/.env"));
  const assetDb = new AssetPrismaClient({
    adapter: new PrismaPg({
      connectionString: required(assetEnv, "DATABASE_URL"),
    }),
  });
  const songDb = new SongPrismaClient({
    adapter: new PrismaPg({
      connectionString: required(songEnv, "DATABASE_URL"),
    }),
  });

  try {
    const assetId = albumId
      ? (
          await songDb.album.findUnique({
            where: { id: albumId },
            select: { artworkAssetId: true },
          })
        )?.artworkAssetId
      : playlistId
        ? (
            await songDb.playlist.findUnique({
              where: { id: playlistId },
              select: { artworkAssetId: true },
            })
          )?.artworkAssetId
        : requestedAssetId;
    if (!assetId) {
      throw new Error(
        albumId
          ? "ALBUM_ARTWORK_NOT_FOUND"
          : playlistId
            ? "PLAYLIST_ARTWORK_NOT_FOUND"
            : "ASSET_ID_REQUIRED",
      );
    }

    const asset = await assetDb.asset.findUnique({
      where: { id: assetId },
      select: {
        id: true,
        kind: true,
        purpose: true,
        status: true,
        sourceObjectKey: true,
        publicUrl: true,
        variants: true,
      },
    });
    if (!asset) throw new Error("ASSET_NOT_FOUND");
    if (
      asset.kind !== "IMAGE" ||
      asset.purpose !== "ARTWORK" ||
      asset.status !== "READY"
    ) {
      throw new Error("ASSET_MUST_BE_A_READY_ARTWORK_IMAGE");
    }

    const palette = color
      ? artworkPaletteFromColor(color)
      : await deriveArtworkPalette(await getSource(asset, assetEnv));
    const [
      artists,
      albums,
      editorialAlbums,
      playlists,
      editorialPlaylists,
      favorite,
    ] = await Promise.all([
      songDb.artist.findMany({
        where: { artworkAssetId: asset.id },
        select: { id: true, artwork: true },
      }),
      songDb.album.findMany({
        where: { artworkAssetId: asset.id },
        select: { id: true, artwork: true },
      }),
      songDb.album.findMany({
        where: { editorialArtworkAssetId: asset.id },
        select: { id: true, editorialArtwork: true },
      }),
      songDb.playlist.findMany({
        where: { artworkAssetId: asset.id },
        select: { id: true, artwork: true },
      }),
      songDb.playlist.findMany({
        where: { editorialArtworkAssetId: asset.id },
        select: { id: true, editorialArtwork: true },
      }),
      songDb.systemFavoriteArtwork.findUnique({
        where: { assetId: asset.id },
        select: { key: true, artwork: true },
      }),
    ]);

    const affected = {
      artists: artists.length,
      albums: albums.length,
      editorialAlbums: editorialAlbums.length,
      playlists: playlists.length,
      editorialPlaylists: editorialPlaylists.length,
      favorites: favorite ? 1 : 0,
    };
    console.log(`[theme] asset ${asset.id}: #${palette.bgColor}`);
    console.log(`[theme] palette ${JSON.stringify(palette)}`);
    console.log(`[theme] preview ${asset.publicUrl}`);
    console.log(`[theme] affected ${JSON.stringify(affected)}`);
    if (dryRun) return;

    const variants = { ...object(asset.variants), palette };
    await assetDb.asset.update({
      where: { id: asset.id },
      data: { variants },
    });
    await songDb.$transaction([
      ...artists.map((item) =>
        songDb.artist.update({
          where: { id: item.id },
          data: {
            artwork: applyPalette(
              item.artwork,
              palette,
            ) as SongPrisma.InputJsonValue,
          },
        }),
      ),
      ...albums.map((item) =>
        songDb.album.update({
          where: { id: item.id },
          data: {
            artwork: applyPalette(
              item.artwork,
              palette,
            ) as SongPrisma.InputJsonValue,
          },
        }),
      ),
      ...editorialAlbums.map((item) =>
        songDb.album.update({
          where: { id: item.id },
          data: {
            editorialArtwork: applyEditorialPalette(
              item.editorialArtwork,
              palette,
            ) as SongPrisma.InputJsonValue,
          },
        }),
      ),
      ...playlists.map((item) =>
        songDb.playlist.update({
          where: { id: item.id },
          data: {
            artwork: applyPalette(
              item.artwork,
              palette,
            ) as SongPrisma.InputJsonValue,
          },
        }),
      ),
      ...editorialPlaylists.map((item) =>
        songDb.playlist.update({
          where: { id: item.id },
          data: {
            editorialArtwork: applyEditorialPalette(
              item.editorialArtwork,
              palette,
            ) as SongPrisma.InputJsonValue,
          },
        }),
      ),
      ...(favorite
        ? [
            songDb.systemFavoriteArtwork.update({
              where: { key: favorite.key },
              data: {
                artwork: applyPalette(
                  favorite.artwork,
                  palette,
                ) as SongPrisma.InputJsonValue,
              },
            }),
          ]
        : []),
    ]);
    console.log(
      "[theme] refreshed metadata only; no audio/video/artwork upload was performed.",
    );
  } finally {
    await Promise.all([assetDb.$disconnect(), songDb.$disconnect()]);
  }
}

void main().catch((error: unknown) => {
  console.error(
    `[theme] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
