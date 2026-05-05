import { defineConfig, devices } from "@playwright/test";
import dotenv from "dotenv";

dotenv.config({ path: ".env", quiet: true });

/** App must listen on 3000 — Qlik / OAuth allowlists expect this port. */
const port = process.env.PORT || "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  timeout: 120_000,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [["html"], ["github"]] : "list",
  /** One baseline per screenshot name so CI (Linux) and local dev share the same files. */
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}{ext}",
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.12,
      animations: "disabled",
    },
  },
  webServer: {
    command: "node index.js",
    /** Use root URL readiness. */
    url: baseURL,
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
    env: { ...process.env, PORT: port },
    timeout: 120_000,
  },
});
