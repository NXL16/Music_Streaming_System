import { StationTrackSelectionService } from './station-track-selection.service';

describe('StationTrackSelectionService', () => {
  const service = new StationTrackSelectionService({} as never);

  it('does not let a featured collaboration bypass the per-artist cap', () => {
    const selected = service.select({
      candidateTiers: [
        [
          { id: 'lead-1', artistIds: ['lead'] },
          { id: 'lead-2', artistIds: ['lead'] },
          { id: 'lead-3', artistIds: ['lead'] },
          { id: 'lead-with-guest', artistIds: ['lead', 'guest'] },
          { id: 'different-artist', artistIds: ['different'] },
        ],
      ],
      limit: 4,
    });

    expect(selected).toEqual([
      'lead-1',
      'lead-2',
      'lead-3',
      'different-artist',
    ]);
  });

  it('uses the relaxed pass only when the strict diversity pass cannot fill', () => {
    const selected = service.select({
      candidateTiers: [
        [
          { id: 'lead-1', artistIds: ['lead'] },
          { id: 'lead-2', artistIds: ['lead'] },
          { id: 'lead-3', artistIds: ['lead'] },
          { id: 'lead-4', artistIds: ['lead'] },
        ],
      ],
      limit: 4,
    });

    expect(selected).toHaveLength(4);
  });
});
