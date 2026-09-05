import { normalizeAuthError } from "../../lib/authUtils";

describe("normalizeAuthError", () => {
  it("returns a readable message from an object error payload", () => {
    expect(
      normalizeAuthError({ message: "Invalid login credentials" })
    ).toBe("Invalid login credentials");
  });

  it("falls back to a generic message when no message is available", () => {
    expect(normalizeAuthError({})).toBe("Invalid email or password. Please try again.");
  });
});
