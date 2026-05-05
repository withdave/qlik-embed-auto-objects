import { expect, test } from "@playwright/test";
import { gotoHome, waitForAssetsLoaded, waitForEmbedsInSection, waitForEmbedPaint, waitForDomStable } from "./helpers/app";
import { SECTION_IDS } from "./helpers/constants";
import {
  checkboxCountInSection,
  clearAllSelections,
  selectFirstInSection,
} from "./helpers/selection";

test.describe("smoke", () => {
  test("loads app assets and reaches ready state", async ({ page }) => {
    await gotoHome(page);
    await waitForAssetsLoaded(page);
    await expect(page.locator("#assets-retry")).toBeHidden();
  });
});

test.describe("selection UI", () => {
  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
    await waitForAssetsLoaded(page);
  });

  test("empty state hides embeds after clear all", async ({ page }) => {
    await clearAllSelections(page);
    await expect(page.getByTestId("empty-state")).toBeVisible();
    await expect(page.locator('[data-testid="embed-card"]')).toHaveCount(0);
  });
});

test.describe("visual embeds", () => {
  // Visual embed rendering is remote/data-dependent; allow enough time for explicit settle windows.
  test.describe.configure({ timeout: 240_000 });

  test.beforeEach(async ({ page }) => {
    await gotoHome(page);
    await waitForAssetsLoaded(page);
    await clearAllSelections(page);
  });

  for (const sectionId of SECTION_IDS) {
    test(`single item: ${sectionId}`, async ({ page }) => {
      const n = await checkboxCountInSection(page, sectionId);
      test.skip(n === 0, `No list items for ${sectionId}`);

      await selectFirstInSection(page, sectionId);
      await waitForEmbedsInSection(page, sectionId, 1);
      const embedBody = page.locator(`#body-${sectionId} [data-testid="embed-body"]`).first();
      await waitForEmbedPaint(page, page.locator(`#body-${sectionId}`));
      await waitForDomStable(page, embedBody, 3_000);

      await expect(embedBody).toBeVisible();
      await expect(embedBody).toHaveScreenshot(`${sectionId}-single.png`);
    });
  }
});
