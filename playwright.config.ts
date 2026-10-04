import { defineConfig, devices } from "@playwright/test";

/**
 * Local smoke run (npm run e2e): signs in with the dev-only button (DEV_LOGIN_EMAIL in .env.local) and
 * checks every main page at desktop and phone size. Uses the Supabase project in .env.local: it adds
 * page views and events to that account, so point it at a development project when you have one.
 */
export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3000", trace: "retain-on-failure" },
  webServer: { command: "npm run dev", url: "http://localhost:3000/login", reuseExistingServer: true, timeout: 120_000 },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "desktop", dependencies: ["setup"], use: { viewport: { width: 1280, height: 900 }, storageState: "e2e/.auth/state.json" } },
    { name: "phone", dependencies: ["setup"], use: { ...devices["iPhone 13"], defaultBrowserType: "chromium", storageState: "e2e/.auth/state.json" } },
  ],
});
