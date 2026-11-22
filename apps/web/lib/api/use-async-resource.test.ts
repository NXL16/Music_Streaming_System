import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { expect, it } from "vitest";
import { useAsyncResource } from "./use-async-resource";

function Probe({
  initialData,
  enabled = true,
}: {
  initialData?: unknown;
  enabled?: boolean;
}) {
  const resource = useAsyncResource(async () => "loaded", "Failed", {
    initialData,
    enabled,
  });
  return String(resource.loading);
}

it.each([null, false, 0, "", []])(
  "accepts cached %j without showing loading",
  (initialData) => {
    expect(renderToString(createElement(Probe, { initialData }))).toBe("false");
  },
);

it("loads only when enabled and no snapshot is available", () => {
  expect(renderToString(createElement(Probe))).toBe("true");
  expect(renderToString(createElement(Probe, { enabled: false }))).toBe(
    "false",
  );
});
