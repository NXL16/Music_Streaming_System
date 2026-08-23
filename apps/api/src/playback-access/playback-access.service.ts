import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { status } from '@grpc/grpc-js';
import { JwtUser, UserRole } from '@musical/shared-types';
import { SongsService } from '../songs/songs.service';

const ADMIN_ROLES = new Set<UserRole>([
  UserRole.SUPER_ADMIN,
  UserRole.ADMIN_USER_OPS,
  UserRole.ADMIN_SECURITY_OPS,
]);

@Injectable()
export class PlaybackAccessService {
  constructor(private readonly songsService: SongsService) {}

  /**
   * Authorizes access to the encrypted playback assets. A regular account may
   * play a public song or a song it owns; administrators may inspect any song.
   */
  async assertCanPlay(songId: string, user: JwtUser): Promise<void> {
    try {
      if (ADMIN_ROLES.has(user.role)) {
        await this.songsService.getSongIngestInfo({ songId });
        return;
      }

      await this.songsService.getSong({
        songId,
        requesterUserId: user.userId,
      });
    } catch (error) {
      if (hasGrpcCode(error, status.PERMISSION_DENIED)) {
        throw new ForbiddenException('SONG_ACCESS_DENIED');
      }
      if (hasGrpcCode(error, status.NOT_FOUND)) {
        throw new NotFoundException('SONG_NOT_FOUND');
      }
      throw error;
    }
  }
}

function hasGrpcCode(error: unknown, expectedCode: status): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === expectedCode
  );
}
