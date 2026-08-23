import { describe, expect, it, vi } from "vitest";
import { resumeAudioContext } from "./audio-context";

describe("resumeAudioContext", () => {
  it("resumes a suspended context from the current user-action turn", () => {
    const resume = vi.fn().mockResolvedValue(undefined);

    resumeAudioContext({ state: "suspended", resume } as never);

    expect(resume).toHaveBeenCalledOnce();
  });

  it("does not touch a running or closed context", () => {
    const resume = vi.fn().mockResolvedValue(undefined);

    resumeAudioContext({ state: "running", resume } as never);
    resumeAudioContext({ state: "closed", resume } as never);

    expect(resume).not.toHaveBeenCalled();
  });
});
