import { systemPlaylistArtistPreview } from './system-playlist-artist-preview';

describe('systemPlaylistArtistPreview', () => {
  it('uses each song primary artist in playlist order and removes duplicates', () => {
    expect(
      systemPlaylistArtistPreview([
        'Lady Gaga, Bruno Mars',
        'Tân Binh Toàn Năng & Guest',
        'Lady Gaga feat. Another Artist',
        'Cường Seven',
        'UPRIZE ft. Guest',
      ]),
    ).toBe('Lady Gaga, Tân Binh Toàn Năng, Cường Seven, UPRIZE and more');
  });

  it('never uses more than seven artists', () => {
    expect(
      systemPlaylistArtistPreview(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']),
    ).toBe('A, B, C, D, E, F, G and more');
  });

  it('keeps the first four artists even when they are long, then respects card width', () => {
    expect(
      systemPlaylistArtistPreview([
        'Artist Name One That Is Long',
        'Artist Name Two That Is Long',
        'Artist Name Three That Is Long',
        'Artist Name Four That Is Long',
        'Artist Name Five That Is Long',
      ]),
    ).toBe(
      'Artist Name One That Is Long, Artist Name Two That Is Long, Artist Name Three That Is Long, Artist Name Four That Is Long and more',
    );
  });
});
