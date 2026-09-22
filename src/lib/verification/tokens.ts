import { createHash, randomBytes } from "crypto";

export function hashSecret(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function generateSecretToken() {
  return randomBytes(32).toString("base64url");
}
