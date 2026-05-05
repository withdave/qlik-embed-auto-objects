import type { Page } from "@playwright/test";
import type { SectionId } from "./constants";

export function pickerSection(page: Page, sectionId: SectionId) {
  return page.getByTestId(`picker-section-${sectionId}`);
}

export async function clearAllSelections(page: Page) {
  await page.locator("#clear-all").click();
}

export async function selectFirstInSection(page: Page, sectionId: SectionId) {
  const section = pickerSection(page, sectionId);
  await section.getByRole("checkbox").first().check();
}

export async function selectFirstNInSection(page: Page, sectionId: SectionId, n: number) {
  const section = pickerSection(page, sectionId);
  const boxes = section.getByRole("checkbox");
  const count = await boxes.count();
  const take = Math.min(n, count);
  for (let i = 0; i < take; i += 1) {
    await boxes.nth(i).check();
  }
  return take;
}

export async function checkboxCountInSection(page: Page, sectionId: SectionId) {
  return pickerSection(page, sectionId).getByRole("checkbox").count();
}
