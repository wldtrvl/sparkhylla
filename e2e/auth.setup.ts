import { expect, test as setup } from "@playwright/test";

/** Sign in once with the dev-only button and keep the session for the other tests. */
setup("sign in", async ({ page }) => {
  await page.goto("/login");
  const devButton = page.getByRole("button", { name: "Войти без письма (только локально)" });
  await expect(devButton, "Set DEV_LOGIN_EMAIL in .env.local").toBeVisible();
  await devButton.click();
  await expect(page.getByRole("navigation", { name: "Разделы" })).toBeVisible({ timeout: 30_000 });
  await page.context().storageState({ path: "e2e/.auth/state.json" });
});
