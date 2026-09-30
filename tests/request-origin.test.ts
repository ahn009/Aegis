import { describe, expect, it } from "vitest";
import { assertSameOrigin } from "../src/lib/request-origin";

describe("cookie mutation origin", () => {
  const app = "https://app.example.test";

  it("accepts reads and exact same-origin mutations", () => {
    expect(() => assertSameOrigin("GET", null, app)).not.toThrow();
    expect(() => assertSameOrigin("POST", app, app)).not.toThrow();
    expect(() => assertSameOrigin("PATCH", app, app)).not.toThrow();
  });

  it.each([null, "null", "https://evil.example.test", "https://app.example.test.evil.test", "http://app.example.test", "https://app.example.test:444", "https://app.example.test/path"])(
    "rejects unsafe origin %s",
    (origin) => expect(() => assertSameOrigin("POST", origin, app)).toThrow(),
  );
});
