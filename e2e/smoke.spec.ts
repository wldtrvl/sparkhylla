import { expect, test, type Page } from "@playwright/test";

const PAGES = [
  ["/", /God (morgen|ettermiddag|kveld)|Good (morning|afternoon|evening)/],
  ["/library", /Библиотека/],
  ["/words", /Мои слова/],
  ["/talk", /Разговор/],
  ["/grammar", /Грамматика/],
  ["/settings", /Настройки/],
] as const;

/** Console errors and uncaught exceptions during a test (Next.js dev noise filtered out). */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && !/Download the React DevTools|\[HMR\]|webpack-hmr|Fast Refresh/.test(m.text()) && errors.push(m.text()));
  return errors;
}

async function expectHealthy(page: Page) {
  await expect(page.getByText("Что-то пошло не так")).toHaveCount(0);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "the page must not scroll sideways").toBeLessThanOrEqual(1);
}

for (const [path, heading] of PAGES) {
  test(`${path} opens`, async ({ page }) => {
    const errors = watchErrors(page);
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
    await expectHealthy(page);
    expect(errors).toEqual([]);
  });
}

test("a book opens in the reader with the listen control", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/library");
  const book = page.locator("a.book", { hasText: "Читать здесь" }).first();
  test.skip((await book.count()) === 0, "no in-app book in the library");
  await book.click();
  await expect(page.locator(".prose")).toBeVisible();
  await expect(page.getByRole("button", { name: /Слушать страницу/ })).toBeVisible();
  await expect(page.getByText(/Страница \d+ из \d+/)).toBeVisible();
  await expectHealthy(page);
  expect(errors).toEqual([]);
});

test("phone: «Ещё» opens the other sections", async ({ page, isMobile }) => {
  test.skip(!isMobile, "phone layout only");
  await page.goto("/");
  await page.getByRole("button", { name: "Ещё" }).click();
  await page.getByRole("dialog", { name: "Другие разделы" }).getByRole("link", { name: "Грамматика" }).click();
  await expect(page).toHaveURL(/\/grammar$/);
  await expect(page.getByRole("dialog", { name: "Другие разделы" })).toHaveCount(0);
});

test("library search says when nothing matches", async ({ page }) => {
  await page.goto("/library?q=zzzz-no-such-book");
  await expect(page.getByText("По запросу «zzzz-no-such-book» ничего не нашлось.")).toBeVisible();
});
