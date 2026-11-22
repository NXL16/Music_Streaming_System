export type PcmChunk = {
  timestamp: number;
  sampleRate: number;
  channels: Float32Array<ArrayBuffer>[];
};

export type PcmBlock = {
  startFrame: number;
  sampleRate: number;
  channels: Float32Array<ArrayBuffer>[];
};

export class PcmAssembler {
  private chunks: PcmChunk[] = [];
  private frames = 0;
  private startFrame = 0;
  private nextFrame: number | null = null;
  private channelCount: number | null = null;
  private blockFrames: number;

  constructor(
    private readonly sampleRate: number,
    initialBlockSeconds = 2,
  ) {
    this.blockFrames = Math.ceil(sampleRate * initialBlockSeconds);
  }

  push(chunk: PcmChunk): PcmBlock | null {
    const frames = chunk.channels[0]?.length ?? 0;
    if (
      !frames ||
      chunk.sampleRate !== this.sampleRate ||
      chunk.channels.some((channel) => channel.length !== frames) ||
      (this.channelCount !== null &&
        chunk.channels.length !== this.channelCount)
    ) {
      throw new Error("Invalid or changing PCM format");
    }
    const frame = Math.round((chunk.timestamp * this.sampleRate) / 1e6);
    if (this.nextFrame !== null && Math.abs(frame - this.nextFrame) > 1) {
      throw new Error(
        `PCM discontinuity: expected frame ${this.nextFrame}, received ${frame}`,
      );
    }
    this.channelCount = chunk.channels.length;
    if (!this.frames) this.startFrame = this.nextFrame ?? frame;
    this.nextFrame = (this.nextFrame ?? frame) + frames;
    this.chunks.push(chunk);
    this.frames += frames;
    return this.frames >= this.blockFrames ? this.flush() : null;
  }

  flush(): PcmBlock | null {
    if (!this.frames || this.channelCount === null) return null;
    const channels = Array.from(
      { length: this.channelCount },
      () => new Float32Array(this.frames),
    );
    let offset = 0;
    for (const chunk of this.chunks) {
      chunk.channels.forEach((channel, index) =>
        channels[index].set(channel, offset),
      );
      offset += chunk.channels[0].length;
    }
    const block = {
      startFrame: this.startFrame,
      sampleRate: this.sampleRate,
      channels,
    };
    this.blockFrames = this.sampleRate * 2;
    this.clear();
    return block;
  }

  clear(): void {
    this.chunks.length = 0;
    this.frames = 0;
  }
}
