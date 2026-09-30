import { SegmentedMediaPlayer } from "../mse/segmented-media-player";

export class ManagedMsePlayer extends SegmentedMediaPlayer {
  private mayFetchSegments = false;

  protected override createMediaSource(): MediaSource {
    const ManagedMediaSource = window.ManagedMediaSource;
    if (!ManagedMediaSource) {
      throw new Error("ManagedMediaSource is not supported");
    }

    return new ManagedMediaSource();
  }

  protected override onMediaSourceCreated(mediaSource: MediaSource): void {
    mediaSource.addEventListener("startstreaming", this.onStartStreaming);
    mediaSource.addEventListener("endstreaming", this.onEndStreaming);
  }

  protected override onMediaSourceDetached(mediaSource: MediaSource): void {
    mediaSource.removeEventListener("startstreaming", this.onStartStreaming);
    mediaSource.removeEventListener("endstreaming", this.onEndStreaming);
    this.mayFetchSegments = false;
  }

  protected override prepareAudio(audio: HTMLAudioElement): void {
    audio.disableRemotePlayback = true;
  }

  protected override restoreAudio(audio: HTMLAudioElement): void {
    audio.disableRemotePlayback = false;
  }

  protected override canFetchSegments(): boolean {
    return this.mayFetchSegments;
  }

  protected override suspendFetching(): void {
    // `endstreaming` means Safari has enough buffered data and asks us not to
    // begin another batch. Do not abort a fragment already in flight: dropping
    // it can leave the very small iOS audio buffer empty before the next
    // `startstreaming` notification. The base fill loop checks
    // `canFetchSegments()` before every new batch instead.
  }

  private onStartStreaming = (): void => {
    this.mayFetchSegments = true;
    this.resumeFetching();
  };

  private onEndStreaming = (): void => {
    this.mayFetchSegments = false;
    this.suspendFetching();
  };
}
