import { describe, expect, it } from "vitest";
import {
  createManagementToken,
  hashManagementToken,
  verifyManagementToken,
} from "./utils";

describe("poll management capabilities", () => {
  it("accepts only the original secret and rejects malformed or replaced secrets", () => {
    const token = createManagementToken();
    const hash = hashManagementToken(token);
    expect(token).toHaveLength(43);
    expect(hash).not.toContain(token);
    expect(verifyManagementToken(token, hash)).toBe(true);
    expect(verifyManagementToken(createManagementToken(), hash)).toBe(false);
    expect(
      verifyManagementToken(
        token,
        hashManagementToken(createManagementToken()),
      ),
    ).toBe(false);
    expect(verifyManagementToken(token, null)).toBe(false);
    expect(verifyManagementToken(token, "malformed")).toBe(false);
    expect(verifyManagementToken("", hash)).toBe(false);
  });
});
