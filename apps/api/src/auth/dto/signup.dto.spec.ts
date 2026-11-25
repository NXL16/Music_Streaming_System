import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { SignupDto } from './signup.dto';

const payload = {
  displayName: 'Music Listener',
  username: 'listener_1',
  email: 'listener@example.test',
  password: 'Music123!',
};

describe('Signup server validation', () => {
  it.each([
    [50, true],
    [51, false],
  ])('validates display names at %i characters', async (length, accepted) => {
    const errors = await validate(
      plainToInstance(SignupDto, {
        ...payload,
        displayName: ` ${'x'.repeat(length)} `,
      }),
    );
    expect(!errors.some((error) => error.property === 'displayName')).toBe(
      accepted,
    );
  });
  it('validates and normalizes data independently of browser constraints', async () => {
    const dto = plainToInstance(SignupDto, {
      ...payload,
      username: ' LISTENER_1 ',
      email: ' LISTENER@example.test ',
      displayName: ' Music Listener ',
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.username).toBe('listener_1');
    expect(dto.email).toBe('listener@example.test');
    expect(dto.displayName).toBe('Music Listener');
  });
  it.each(['short', 'music123!', 'Music123#'])(
    'rejects weak passwords sent directly to the API: %s',
    async (password) => {
      const errors = await validate(
        plainToInstance(SignupDto, { ...payload, password }),
      );
      expect(errors.some((error) => error.property === 'password')).toBe(true);
    },
  );
  it('rejects an invalid username even when client checks are bypassed', async () => {
    const errors = await validate(
      plainToInstance(SignupDto, { ...payload, username: 'bad name' }),
    );
    expect(errors.some((error) => error.property === 'username')).toBe(true);
  });
});
