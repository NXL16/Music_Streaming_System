import { MsePlayer } from './mse/mse-player';
import {
  ManagedMsePlayer,
  canUseManagedMse,
} from './mms';

export type MediaPlayer = MsePlayer | ManagedMsePlayer;

export function createMediaPlayer(): MediaPlayer {
  if (canUseManagedMse()) {
    return new ManagedMsePlayer();
  }

  return new MsePlayer();
}
