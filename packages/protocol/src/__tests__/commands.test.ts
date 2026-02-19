import { describe, expect, it } from "vitest";
import { parseClientCommand } from "../commands";

describe("client command parsing", () => {
  it("parses SUBSCRIBE command", () => {
    const command = parseClientCommand({ type: "SUBSCRIBE" });
    expect(command).toEqual({ type: "SUBSCRIBE" });
  });

  it("parses RUN_CODE command with optional payload fields", () => {
    const command = parseClientCommand({
      type: "RUN_CODE",
      payload: {
        code: "console.log(1)",
        language: "ts",
        maxEvents: 250,
      },
    });
    expect(command.type).toBe("RUN_CODE");
    if (command.type === "RUN_CODE") {
      expect(command.payload.language).toBe("ts");
      expect(command.payload.maxEvents).toBe(250);
    }
  });

  it("rejects RUN_CODE with invalid language", () => {
    expect(() =>
      parseClientCommand({
        type: "RUN_CODE",
        payload: { code: "x", language: "python" },
      }),
    ).toThrow();
  });

  it("rejects unknown command type", () => {
    expect(() =>
      parseClientCommand({
        type: "UNKNOWN",
      }),
    ).toThrow();
  });
});
