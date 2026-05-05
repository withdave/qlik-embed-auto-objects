import type { Locator, Page } from "@playwright/test";
import { expect } from "@playwright/test";

/** Qlik embeds can take up to this long to fully render after the custom element is in the DOM. */
export const EMBED_FULL_RENDER_TIMEOUT_MS = 20_000;
/** Visual stability check: interval between snapshot comparisons and max total wait. */
export const EMBED_SNAPSHOT_INTERVAL_MS = 3_000;
export const EMBED_SNAPSHOT_MAX_WAIT_MS = 30_000;

export async function gotoHome(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
}

/** Waits until asset discovery finished successfully (same copy as `setAssetsStatus` in `public/script.js`). */
export async function waitForAssetsLoaded(page: Page, timeout = 120_000) {
  const status = page.getByTestId("assets-status");
  await expect(status).toHaveAttribute("data-tone", "ready", { timeout });
  await expect(status).toHaveText(/Loaded \d+ sheets and \d+ objects/);
}

export async function waitForEmbedsInSection(page: Page, sectionId: string, minCount = 1) {
  const body = page.locator(`#body-${sectionId}`);
  await expect(body.locator('[data-testid="embed-card"]')).toHaveCount(minCount, {
    timeout: 90_000,
  });
  await expect(body.locator("qlik-embed")).toHaveCount(minCount, { timeout: 90_000 });
}

/**
 * Waits until `qlik-embed` nodes under `root` are visible and have layout (not just attached).
 * Uses up to `timeoutMs` (default 20s) so screenshots run after charts finish rendering.
 */
export async function waitForEmbedPaint(page: Page, root?: Locator, timeoutMs = EMBED_FULL_RENDER_TIMEOUT_MS) {
  const scope = root ?? page.locator("body");
  const embeds = scope.locator("qlik-embed");
  const count = await embeds.count();
  if (count === 0) {
    return;
  }

  // Do not use `networkidle` — Qlik/embed keeps WebSockets and requests open, so it may never settle.

  for (let i = 0; i < count; i += 1) {
    const embed = embeds.nth(i);
    await embed.waitFor({ state: "attached", timeout: timeoutMs });
    // Qlik embeds render asynchronously and sometimes keep boundingBox() as null.
    // Instead, detect paint signals inside the embed's shadowRoot (best-effort).
    try {
      await expect
        .poll(
          async () => {
            return embed.evaluate((el) => {
              const root = el && (el).shadowRoot ? el.shadowRoot : null;
              if (!root) return false;
              return Boolean(root.querySelector("canvas, iframe, img, svg"));
            });
          },
          { timeout: timeoutMs, intervals: [500, 1000, 1500] },
        )
        .toBeTruthy();
    } catch {
      // If detection doesn't work for a particular UI type, still wait briefly so the screenshot has time to settle.
    }

    // Keep a short settle delay; DOM-stability gate will decide when to screenshot.
    await page.waitForTimeout(250);
  }

  // Visual stability: snapshot every EMBED_SNAPSHOT_INTERVAL_MS, stop when two consecutive frames match.
  let prev: string | null = null;
  const deadline = Date.now() + EMBED_SNAPSHOT_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    await page.waitForTimeout(EMBED_SNAPSHOT_INTERVAL_MS);
    const curr = (await scope.screenshot({ animations: "disabled" })).toString("base64");
    if (prev !== null && curr === prev) break;
    prev = curr;
  }
}

/**
 * Waits until the DOM under `scope` stops mutating for `stableMs`.
 * Uses `MutationObserver` (best-effort) and snapshots anyway after `timeoutMs` even if unstable.
 */
export async function waitForDomStable(
  page: Page,
  scope: Locator,
  stableMs = 3_000,
  timeoutMs = EMBED_FULL_RENDER_TIMEOUT_MS,
) {
  const count = await scope.count();
  if (count === 0) {
    return;
  }

  const handles = await scope.elementHandles();
  const token = `domStable_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;

  // Install observers and store last mutation timestamp.
  await page.evaluate(
    ({ handles, token }) => {
      const store: { lastMutation: number; observers: MutationObserver[] } = {
        lastMutation: Date.now(),
        observers: [],
      };
      (window as any)[token] = store;

      const record = () => {
        store.lastMutation = Date.now();
      };

      for (const el of handles) {
        if (!el) continue;
        const observer = new MutationObserver(record);
        observer.observe(el, {
          subtree: true,
          childList: true,
          attributes: true,
          characterData: true,
        });
        store.observers.push(observer);
      }
    },
    { handles, token },
  );

  try {
    await page.waitForFunction(
      ({ token, stableMs }) => {
        const store = (window as any)[token] as { lastMutation?: number } | undefined;
        if (!store) return false;
        const last = typeof store.lastMutation === "number" ? store.lastMutation : 0;
        return Date.now() - last >= stableMs;
      },
      { token, stableMs },
      { timeout: timeoutMs, polling: 250 },
    );
  } catch {
    // Unstable DOM: snapshot anyway after timeout.
  } finally {
    await page.evaluate((t) => {
      const store = (window as any)[t];
      if (!store) return;
      if (Array.isArray(store.observers)) {
        store.observers.forEach((o: MutationObserver) => {
          try {
            o.disconnect();
          } catch {
            // ignore
          }
        });
      }
      delete (window as any)[t];
    }, token);
  }
}
