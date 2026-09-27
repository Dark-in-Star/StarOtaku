import { expect, test } from "@playwright/test";
import { loginAs } from "./auth-helpers";

test.describe("My lists (logged out)", () => {
  test("my anime list prompts login instead of erroring", async ({ page }) => {
    await page.goto("/mylist?media=anime");
    await expect(page.getByText("Log in with MyAnimeList").first()).toBeVisible();
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("my manga list prompts login instead of erroring", async ({ page }) => {
    await page.goto("/mylist?media=manga");
    await expect(page.getByText("Log in with MyAnimeList").first()).toBeVisible();
    await expect(page.getByText("Something went wrong")).not.toBeVisible();
  });

  test("profile page prompts login instead of erroring", async ({ page }) => {
    await page.goto("/profile");
    await expect(page.getByText("Log in with MyAnimeList").first()).toBeVisible();
  });
});

test.describe("My lists (logged in)", () => {
  test("my anime list renders real entries", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/mylist?media=anime");

    await expect(page.getByRole("heading", { name: "My Anime List" })).toBeVisible();
    await expect(page.locator('a[href^="/anime/"]').first()).toBeVisible();
  });

  test("my manga list renders real entries", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/mylist?media=manga");

    await expect(page.getByRole("heading", { name: "My Manga List" })).toBeVisible();
    await expect(page.locator('a[href^="/manga/"]').first()).toBeVisible();
  });

  test("the media toggle switches between anime and manga lists", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/mylist?media=anime");

    await page.getByRole("button", { name: "Manga" }).click();
    await expect(page).toHaveURL(/media=manga/);
    await expect(page.getByRole("heading", { name: "My Manga List" })).toBeVisible();
  });

  test("status tabs filter the anime list without erroring", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/mylist?media=anime");

    await expect(page.getByText("Mock Anime 1")).toBeVisible();
    await expect(page.getByText("Mock Anime 2")).toBeVisible();

    const completedTab = page.getByRole("button", { name: /^Completed/ });
    await completedTab.scrollIntoViewIfNeeded();
    await completedTab.click();

    await expect(page.getByText("Mock Anime 2")).toBeVisible();
    await expect(page.getByText("Mock Anime 1")).not.toBeVisible();
    await expect(page.getByRole("heading", { name: "My Anime List" })).toBeVisible();
  });

  test("type and sort dropdowns filter and reorder the anime list", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/mylist?media=anime");

    await page.getByRole("combobox", { name: "Sort" }).click();
    await page.getByRole("option", { name: "Score" }).click();
    await expect(page.getByText("Mock Anime 2")).toBeVisible();

    await page.getByRole("combobox", { name: "Type" }).click();
    await page.getByRole("option", { name: "Movie" }).click();
    await expect(page.getByText("Nothing here yet")).toBeVisible();
  });

  test("the plus button increases episodes watched for an entry", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/mylist?media=anime");

    const row = page.getByTestId("anime-list-row-1000");
    await expect(row.getByText("5 / 24 ep")).toBeVisible();

    await row.getByRole("button", { name: "Increase episodes watched" }).click();

    await expect(row.getByText("6 / 24 ep")).toBeVisible();
    await expect(page).toHaveURL(/\/mylist/);
  });

  test("clicking anywhere on a row opens the anime details page", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/mylist?media=anime");

    await page.getByTestId("anime-list-row-1000").click();

    await expect(page).toHaveURL(/\/anime\/1000$/);
  });

  test("the edit modal updates status and score, moving the entry to its new tab", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/mylist?media=anime");

    const row = page.getByTestId("anime-list-row-1001");
    await row.getByRole("button", { name: "Edit" }).click();

    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: "Mock Anime 2" })).toBeVisible();
    await expect(page).toHaveURL(/\/mylist/);
    await dialog.getByRole("button", { name: "On Hold" }).click();
    await dialog.getByRole("button", { name: "Score 7" }).click();
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(dialog).not.toBeVisible();

    await page.getByRole("button", { name: /^Completed/ }).click();
    await expect(page.getByText("Mock Anime 2")).not.toBeVisible();

    await page.getByRole("button", { name: /^On Hold/ }).click();
    await expect(page.getByText("Mock Anime 2")).toBeVisible();
  });

  test("removing an entry from the edit modal drops it from the list", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/mylist?media=anime");

    const row = page.getByTestId("anime-list-row-1002");
    await row.getByRole("button", { name: "Edit" }).click();

    await page.getByRole("button", { name: /remove from list/i }).click();

    await expect(page.getByText("Mock Anime 3")).not.toBeVisible();
  });

  test("profile page renders account info and stats", async ({ page, baseURL }) => {
    await loginAs(page, baseURL!);
    await page.goto("/profile");

    await expect(page.getByText("Mock User")).toBeVisible();
    await expect(page.getByText("Mean Score")).toBeVisible();
  });
});
