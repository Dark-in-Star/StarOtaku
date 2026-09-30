import { expect, test } from "@playwright/test";
import { loginAs } from "./auth-helpers";

test.describe("Manga browsing", () => {
  test("ranking dropdown switches the active ranking type", async ({ page }) => {
    await page.goto("/browse?media=manga");
    await expect(page.getByRole("heading", { name: "Manga Rankings" })).toBeVisible();

    await page.getByRole("combobox", { name: "Ranking" }).click();
    await page.getByRole("option", { name: "Popularity" }).click();
    await expect(page).toHaveURL(/type=bypopularity/);

    await expect(page.locator('a[href^="/manga/"]').first()).toBeVisible();
  });

  test("detail page shows synopsis and info panel with a login prompt when logged out", async ({ page }) => {
    await page.goto("/browse?media=manga&type=all");
    await page.locator('a[href^="/manga/"]').first().click();

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByText("Log in with MyAnimeList").first()).toBeVisible();
    await expect(page.getByText("Chapters", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Volumes", { exact: true }).first()).toBeVisible();
  });

  test("detail page shows a real list status editor when logged in", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/browse?media=manga&type=all");
    await page.locator('a[href^="/manga/"]').first().click();

    // The panel shows "Add to List" for an entry not on the list yet, and an edit button for one that is.
    await expect(page.getByRole("button", { name: /Add to List|Edit list entry/ })).toBeVisible();
  });
});
