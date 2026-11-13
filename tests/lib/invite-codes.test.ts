import { describe, expect, it } from "vitest";
import {
  generateInviteCode,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  normalizeInviteCode,
} from "@/lib/invite-codes";

describe("generateInviteCode", () => {
  it("produces a short code of the default length", () => {
    expect(generateInviteCode()).toHaveLength(INVITE_CODE_LENGTH);
    expect(generateInviteCode(12)).toHaveLength(12);
  });

  it("uses only uppercase letters and digits that are hard to misread", () => {
    for (let run = 0; run < 200; run += 1) {
      expect(generateInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]+$/);
    }
    for (const confusing of ["I", "O", "0", "1"]) {
      expect(INVITE_CODE_ALPHABET).not.toContain(confusing);
    }
  });

  it("does not repeat itself", () => {
    const codes = new Set(Array.from({ length: 500 }, () => generateInviteCode()));
    expect(codes.size).toBe(500);
  });
});

describe("normalizeInviteCode", () => {
  it("ignores case and surrounding spaces", () => {
    expect(normalizeInviteCode("  abcd2345 ")).toBe("ABCD2345");
  });
});
