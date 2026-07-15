import * as dotenv from 'dotenv';
import { join } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

dotenv.config({ path: join(process.cwd(), '.env') });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl }),
});

function normalizedCatalogText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function albumArtistNames(value: string): string[] {
  const seen = new Set<string>();
  return value
    .split(/\s*(?:,|&|\b(?:and|feat\.?|ft\.?)\b)\s*/i)
    .map((name) => name.trim())
    .filter((name) => {
      const normalizedName = normalizedCatalogText(name);
      if (!normalizedName || seen.has(normalizedName)) return false;
      seen.add(normalizedName);
      return true;
    });
}

async function main(): Promise<void> {
  const [albums, artists] = await Promise.all([
    prisma.album.findMany({
      where: { artistName: { not: '' } },
      select: { id: true, storefront: true, artistName: true },
    }),
    prisma.artist.findMany({
      select: { id: true, storefront: true, name: true },
    }),
  ]);
  const artistIdByStorefrontAndName = new Map<string, string>();
  for (const artist of artists) {
    artistIdByStorefrontAndName.set(
      `${artist.storefront}\u001f${normalizedCatalogText(artist.name)}`,
      artist.id,
    );
  }

  let updatedAlbums = 0;
  for (const album of albums) {
    const names = albumArtistNames(album.artistName);
    if (!names.length) continue;

    const artistIds: string[] = [];
    for (const name of names) {
      const key = `${album.storefront}\u001f${normalizedCatalogText(name)}`;
      const artistId = artistIdByStorefrontAndName.get(key);
      if (artistId) artistIds.push(artistId);
    }

    await prisma.$transaction(async (tx) => {
      await tx.albumArtistCredit.deleteMany({
        where: { albumId: album.id },
      });
      await tx.albumArtistCredit.createMany({
        data: artistIds.map((artistId, position) => ({
          albumId: album.id,
          artistId,
          position,
        })),
      });
    });
    updatedAlbums += 1;
  }

  const credits = await prisma.albumArtistCredit.findMany({
    select: {
      albumId: true,
      position: true,
      artist: { select: { name: true } },
    },
    orderBy: [{ albumId: 'asc' }, { position: 'asc' }],
  });
  const creditNamesByAlbum = new Map<string, string[]>();
  for (const credit of credits) {
    const names = creditNamesByAlbum.get(credit.albumId) ?? [];
    names.push(normalizedCatalogText(credit.artist.name));
    creditNamesByAlbum.set(credit.albumId, names);
  }
  const mismatchedAlbums = albums.filter((album) => {
    const expected = albumArtistNames(album.artistName)
      .map(normalizedCatalogText)
      .filter((name) =>
        artistIdByStorefrontAndName.has(`${album.storefront}\u001f${name}`),
      );
    const actual = creditNamesByAlbum.get(album.id) ?? [];
    return expected.length !== actual.length || expected.some((name, index) => name !== actual[index]);
  });
  if (mismatchedAlbums.length) {
    throw new Error(
      `Album artist credit verification failed for ${mismatchedAlbums.length} albums.`,
    );
  }

  console.log(
    `Backfilled ${updatedAlbums} albums using only existing artists and verified all album credits.`,
  );
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
