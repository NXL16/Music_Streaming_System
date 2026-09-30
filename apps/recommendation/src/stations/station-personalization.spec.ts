import type { TasteProfile } from '../listening/listening.service';
import {
  isStationCandidateEligible,
  rankStationCandidatesForProfile,
} from './station-personalization';

const profile = (hidden = new Map<string, Set<string>>()): TasteProfile => ({
  genres: [{ name: 'Pop', weight: 1 }],
  artists: [{ name: 'Preferred Artist', weight: 1 }],
  audioTags: [{ name: 'upbeat', weight: 1 }],
  preferredBpm: 120,
  bpmTolerance: 20,
  preferredEnergy: 0.8,
  energyTolerance: 0.2,
  avgCompletionRate: 1,
  totalListenTimeSec: 0,
  listenedSongIds: new Set(),
  audioSeedSongIds: new Set(),
  listenedAlbumIds: new Set(),
  listenedAlbumNames: new Set(),
  hiddenResourceIds: hidden,
});

describe('station personalization', () => {
  it('filters hidden songs, albums and artists', () => {
    const relationships = {
      albums: { data: [{ id: 'album-hidden' }] },
      artists: { data: [{ id: 'artist-visible' }] },
    };
    expect(
      isStationCandidateEligible(
        { resourceId: 'song-visible', relationships },
        profile(new Map([['albums', new Set(['album-hidden'])]])),
      ),
    ).toBe(false);
    expect(
      isStationCandidateEligible(
        { resourceId: 'song-hidden', relationships: null },
        profile(new Map([['songs', new Set(['song-hidden'])]])),
      ),
    ).toBe(false);
  });

  it('ranks fallback candidates using AI audio features and taste affinity', () => {
    const ranked = rankStationCandidatesForProfile(
      [
        {
          resourceId: 'other',
          artistName: 'Other Artist',
          genreNames: ['Rock'],
          attributes: { audioBpm: 70, audioEnergy: 0.1, audioTags: ['calm'] },
          relationships: null,
        },
        {
          resourceId: 'matched',
          artistName: 'Preferred Artist',
          genreNames: ['Pop'],
          attributes: { audioBpm: 120, audioEnergy: 0.8, audioTags: ['upbeat'] },
          relationships: null,
        },
      ],
      profile(),
    );

    expect(ranked.map((song) => song.resourceId)).toEqual(['matched', 'other']);
  });
});
