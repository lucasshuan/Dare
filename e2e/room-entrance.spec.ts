import { expect, test } from "@playwright/test";
import { newPlayer } from "./helpers";

for (const phone of [false, true]) {
  test(`room entrance preserves the cards and backdrop (${phone ? "phone" : "desktop"})`, async ({
    browser,
  }) => {
    const page = await newPlayer(browser, phone);
    let releaseCreate = () => {};
    let releaseRead = () => {};
    const creating = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    const reading = new Promise<void>((resolve) => {
      releaseRead = resolve;
    });
    await page.route("**/en/new?game=lineup", async (route) => {
      if (route.request().method() === "POST") await creating;
      await route.continue();
    });
    await page.route("**/api/rooms/*", async (route) => {
      if (route.request().method() === "GET") await reading;
      await route.continue();
    });

    await page.goto("/en/new?game=lineup");
    const overlay = page.locator("[data-room-entrance]");
    const hand = await overlay.locator(".h-44").elementHandle();
    expect(hand).not.toBeNull();
    releaseCreate();
    await page.waitForURL(/\/r\/[A-Z0-9]{5}$/);
    await expect(overlay).toHaveAttribute("data-room-entrance", "room");
    expect(await hand?.evaluate((node) => node.isConnected)).toBe(true);
    const background = page.locator(".lobby-backdrop");
    await expect(background).toHaveAttribute("data-game", "lineup");
    const ground = await background.elementHandle();
    await expect
      .poll(() =>
        background.evaluate((node) => Number(getComputedStyle(node).opacity)),
      )
      .toBeGreaterThan(0.99);
    await expect(overlay.getByRole("status")).toContainText("Opening the room");
    await page.screenshot({ path: test.info().outputPath("room-loading.png") });

    const opened = page.waitForResponse(
      (response) =>
        /\/api\/rooms\/[A-Z0-9]{5}(?:\?|$)/.test(response.url()) &&
        response.request().method() === "GET",
    );
    releaseRead();
    expect((await opened).ok()).toBe(true);
    await expect(overlay).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      /'s room$/,
    );
    expect(await ground?.evaluate((node) => node.isConnected)).toBe(true);
    await expect(background).toHaveCount(1);
    await page.screenshot({ path: test.info().outputPath("lobby.png") });
  });
}

test("reduced motion and failed room links leave the entrance", async ({
  browser,
}) => {
  const page = await newPlayer(browser);
  const hydrationErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" && /hydrat/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/rooms/ZZZZZ*", (route) =>
    route.fulfill({ status: 404, body: "{}" }),
  );
  const missing = page.waitForResponse((response) =>
    /\/api\/rooms\/ZZZZZ(?:\?|$)/.test(response.url()),
  );
  await page.goto("/en/r/ZZZZZ");
  expect((await missing).status()).toBe(404);
  await expect(page.locator("[data-room-entrance]")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "This room is gone" }),
  ).toBeVisible();
  await expect(page.locator(".lobby-backdrop")).toHaveCount(0);
  expect(hydrationErrors).toEqual([]);
  await page.goto("/en/r/11111");
  await expect(page.locator("[data-room-entrance]")).toHaveCount(0);
  await expect(page.getByRole("heading").first()).toBeVisible();
});

test("a direct link waits for its game before painting the backdrop", async ({
  browser,
}) => {
  const host = await newPlayer(browser);
  await host.goto("/en/new?game=impostor");
  await host.waitForURL(/\/r\/[A-Z0-9]{5}$/);
  const code = host.url().split("/").pop() as string;

  const guest = await newPlayer(browser);
  let releaseRead = () => {};
  const reading = new Promise<void>((resolve) => {
    releaseRead = resolve;
  });
  await guest.route("**/api/rooms/*", async (route) => {
    if (route.request().method() === "GET") await reading;
    await route.continue();
  });
  await guest.goto(`/en/r/${code}`);
  await expect(guest.locator("[data-room-entrance]")).toBeVisible();
  // the game is not known yet: no game's colours
  await expect(guest.locator(".lobby-backdrop")).toHaveCount(0);
  releaseRead();
  await expect(guest.locator(".lobby-backdrop")).toHaveAttribute(
    "data-game",
    "impostor",
  );
});
