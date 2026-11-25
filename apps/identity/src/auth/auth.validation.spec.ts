import { normalizeAndValidateUpdateProfileRequest } from './auth.validation';

describe('profile update normalization', () => {
  it('preserves an explicit empty bio so it can be removed', () => {
    expect(
      normalizeAndValidateUpdateProfileRequest({
        userId: 'profile-test',
        displayName: 'Listener',
        bio: '   ',
      }).bio,
    ).toBe('');
  });

  it('leaves an omitted bio unchanged', () => {
    expect(
      normalizeAndValidateUpdateProfileRequest({
        userId: 'profile-test',
        displayName: 'Listener',
      }).bio,
    ).toBeUndefined();
  });

  it('trims the name and bio', () => {
    expect(
      normalizeAndValidateUpdateProfileRequest({
        userId: 'profile-test',
        displayName: ' Listener ',
        bio: ' Music lover ',
      }),
    ).toMatchObject({
      userId: 'profile-test',
      displayName: 'Listener',
      bio: 'Music lover',
    });
  });
});
