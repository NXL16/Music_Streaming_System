import { MsePlayer } from './mse/mse-player';
import type { SegmentedMediaPlayer } from './mse/segmented-media-player';
import {
  ManagedMsePlayer,
  canUseManagedMse,
} from './mms';

export type MediaPlayer = SegmentedMediaPlayer;

export function createMediaPlayer(): MediaPlayer {
  if (canUseManagedMse()) {
    return new ManagedMsePlayer();
  }

  return new MsePlayer();
}
