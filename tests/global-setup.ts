import dotenv from "dotenv";
import type { FullConfig } from "@playwright/test";

dotenv.config({ path: ".env", quiet: true });

const REQUIRED = ["HOST", "CLIENT_ID", "CLIENT_SECRET", "APP_ID", "SESSION_SECRET"] as const;

export default async function globalSetup(_config: FullConfig) {
  const missing = REQUIRED.filter((key) => {
    const v = process.env[key];
    return typeof v !== "string" || v.trim() === "";
  });
  if (missing.length > 0) {
    throw new Error(
      `E2E requires env: ${missing.join(", ")}. Copy .env.example or set repository secrets for CI.`,
    );
  }
}
