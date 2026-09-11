import { describe, expect, it } from "vitest";
import { createAmbientHlsConfig } from "./ambient-hls-policy";

describe("createAmbientHlsConfig", () => {
  it("keeps card video lightweight and configured for VOD", () => {
    const config = createAmbientHlsConfig("card");

    expect(config).toMatchObject({
      autoStartLoad: false,
      lowLatencyMode: false,
      capLevelToPlayerSize: true,
      maxBufferLength: 4,
      maxMaxBufferLength: 8,
      maxBufferSize: 8_000_000,
    });
    expect(config.fragLoadPolicy?.default.errorRetry).toMatchObject({
      maxNumRetry: 3,
      backoff: "exponential",
    });
  });

  it("gives a detail hero a larger, bounded buffer", () => {
    const config = createAmbientHlsConfig("hero");

    expect(config).toMatchObject({
      autoStartLoad: false,
      lowLatencyMode: false,
      capLevelToPlayerSize: false,
      startFragPrefetch: true,
      maxBufferLength: 20,
      maxMaxBufferLength: 30,
      maxBufferSize: 24_000_000,
    });
  });
});
