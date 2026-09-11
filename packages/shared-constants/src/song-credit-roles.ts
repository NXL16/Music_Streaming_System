export const SONG_CREDIT_SECTIONS = [
  'Performing Artists',
  'Composition & Lyrics',
  'Production & Engineering',
] as const;

export type SongCreditSection = (typeof SONG_CREDIT_SECTIONS)[number];

export type SongCreditRole = {
  id: string;
  label: string;
  section: SongCreditSection;
  /** Used by catalog ownership, not offered as a detailed listener credit. */
  internal?: boolean;
  /** Accepted to keep previously saved catalog data valid, but not offered for new credits. */
  legacy?: boolean;
};

/**
 * Single source of truth for catalog song-credit roles.
 *
 * IDs are persisted in the database/API. Never rename an ID: add a legacy
 * entry instead and map it to the current listener-facing label.
 */
export const SONG_CREDIT_ROLES: readonly SongCreditRole[] = [
  { id: 'artist', label: 'Performer', section: 'Performing Artists', internal: true },
  { id: 'performer', label: 'Performer', section: 'Performing Artists' },
  { id: 'vocals', label: 'Vocals', section: 'Performing Artists' },
  { id: 'lead_vocals', label: 'Lead Vocals', section: 'Performing Artists' },
  { id: 'background_vocals', label: 'Background Vocals', section: 'Performing Artists' },
  { id: 'musician', label: 'Musician', section: 'Performing Artists' },
  { id: 'instrumentalist', label: 'Instrumentalist', section: 'Performing Artists' },
  { id: 'guitar', label: 'Guitar', section: 'Performing Artists' },
  { id: 'bass_guitar', label: 'Bass Guitar', section: 'Performing Artists' },
  { id: 'drums', label: 'Drums', section: 'Performing Artists' },
  { id: 'percussion', label: 'Percussion', section: 'Performing Artists' },
  { id: 'keyboards', label: 'Keyboards', section: 'Performing Artists' },
  { id: 'piano', label: 'Piano', section: 'Performing Artists' },
  { id: 'synthesizer', label: 'Synthesizer', section: 'Performing Artists' },
  { id: 'strings', label: 'Strings', section: 'Performing Artists' },
  { id: 'violin', label: 'Violin', section: 'Performing Artists' },
  { id: 'programming', label: 'Programming', section: 'Performing Artists' },
  { id: 'composer', label: 'Composer', section: 'Composition & Lyrics' },
  { id: 'lyrics', label: 'Lyrics', section: 'Composition & Lyrics' },
  { id: 'songwriter', label: 'Songwriter', section: 'Composition & Lyrics' },
  { id: 'arranger', label: 'Arranger', section: 'Composition & Lyrics' },
  { id: 'vocal_arranger', label: 'Vocal Arranger', section: 'Composition & Lyrics' },
  { id: 'translator', label: 'Translator', section: 'Composition & Lyrics' },
  { id: 'producer', label: 'Producer', section: 'Production & Engineering' },
  { id: 'co_producer', label: 'Co-producer', section: 'Production & Engineering' },
  { id: 'executive_producer', label: 'Executive Producer', section: 'Production & Engineering' },
  { id: 'recording_engineer', label: 'Recording Engineer', section: 'Production & Engineering' },
  { id: 'mixing_engineer', label: 'Mixing Engineer', section: 'Production & Engineering' },
  { id: 'mastering_engineer', label: 'Mastering Engineer', section: 'Production & Engineering' },
  { id: 'immersive_engineer', label: 'Immersive Engineer', section: 'Production & Engineering' },
  { id: 'assistant_engineer', label: 'Assistant Engineer', section: 'Production & Engineering' },
  { id: 'engineer', label: 'Engineer', section: 'Production & Engineering' },
  { id: 'remixer', label: 'Remixer', section: 'Production & Engineering' },
  { id: 'featured_artist', label: 'Performer', section: 'Performing Artists', legacy: true },
  { id: 'lyricist', label: 'Lyrics', section: 'Composition & Lyrics', legacy: true },
  { id: 'programmer', label: 'Programming', section: 'Performing Artists', legacy: true },
  { id: 'mixer', label: 'Mixing Engineer', section: 'Production & Engineering', legacy: true },
];

export const SONG_CREDIT_ROLE_IDS = new Set(SONG_CREDIT_ROLES.map((role) => role.id));

export const SONG_CREDIT_ROLE_BY_ID = new Map(
  SONG_CREDIT_ROLES.map((role) => [role.id, role] as const),
);

export const SONG_CREDIT_ROLE_GROUPS = SONG_CREDIT_SECTIONS.map((section) => ({
  section,
  roles: SONG_CREDIT_ROLES.filter(
    (role) => role.section === section && !role.internal && !role.legacy,
  ),
}));
