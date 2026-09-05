export function normalizeAuthError(error: unknown): string {
  if (!error) {
    return "Invalid email or password. Please try again.";
  }

  if (typeof error === "string") {
    return error || "Invalid email or password. Please try again.";
  }

  if (error instanceof Error) {
    return error.message || "Invalid email or password. Please try again.";
  }

  if (typeof error === "object") {
    const obj = error as Record<string, unknown>;
    if (typeof obj.message === "string" && obj.message.trim()) {
      return obj.message;
    }
    if (typeof obj.detail === "string" && obj.detail.trim()) {
      return obj.detail;
    }
    if (typeof obj.error_description === "string" && obj.error_description.trim()) {
      return obj.error_description;
    }
  }

  return "Invalid email or password. Please try again.";
}
