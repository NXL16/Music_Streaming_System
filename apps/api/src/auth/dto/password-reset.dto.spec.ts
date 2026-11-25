import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { PasswordResetTokenDto, ResetPasswordDto } from './password-reset.dto';

describe('Password reset token validation', () => {
  it.each([undefined, '', 123])(
    'rejects missing or malformed tokens (%j)',
    async (token) => {
      expect(
        await validate(plainToInstance(PasswordResetTokenDto, { token })),
      ).not.toEqual([]);
    },
  );

  it('requires the token for both preflight and password reset', async () => {
    const errors = await validate(
      plainToInstance(ResetPasswordDto, { newPassword: 'Music123!' }),
    );
    expect(errors.some((error) => error.property === 'token')).toBe(true);
  });

  it('accepts a token alone for preflight and with a password for reset', async () => {
    expect(
      await validate(
        plainToInstance(PasswordResetTokenDto, { token: 'test-reset-token' }),
      ),
    ).toEqual([]);
    expect(
      await validate(
        plainToInstance(ResetPasswordDto, {
          token: 'test-reset-token',
          newPassword: 'Music123!',
        }),
      ),
    ).toEqual([]);
  });
});
