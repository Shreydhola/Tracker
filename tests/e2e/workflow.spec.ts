import { test, expect } from "@playwright/test";
import { readSheet } from "read-excel-file/node";
import { readFile } from "node:fs/promises";
test("administrator imports, searches, exports and manages exceptions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!password)
    throw new Error(
      "Set E2E_ADMIN_PASSWORD for an existing test administrator",
    );
  await page.goto("/shipments");
  await expect(page).toHaveURL(/login/);
  await page
    .getByLabel("Email address")
    .fill(process.env.ADMIN_EMAIL ?? "admin@example.com");
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Sign in →" }).click();
  await expect(
    page.getByRole("heading", { name: "Shipment overview" }),
  ).toBeVisible();
  await page.goto("/imports");
  await page.getByLabel("Shipment file").setInputFiles({
    name: "browser-import.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      "Tracking Number,Order ID,Marketplace\nE2ETRACK00001,E2E-ORDER,Amazon CA\nE2ETRACK00001,E2E-ORDER,Amazon CA\n!,INVALID,Amazon US",
    ),
  });
  await page.getByRole("button", { name: "Preview import" }).click();
  await expect(
    page.getByRole("heading", { name: "Review 3 rows" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Confirm & import" }).click();
  await expect(
    page.getByRole("heading", { name: "Import complete" }),
  ).toBeVisible();
  await page.goto("/shipments");
  await page.getByLabel("Search shipments").fill("E2ETRACK00001");
  await expect(
    page.getByRole("link", { name: "E2ETRACK00001", exact: true }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "CSV", exact: true }).click();
  expect((await download).suggestedFilename()).toBe("shipments.csv");
  const xlsxDownload = page.waitForEvent("download");
  await page.getByRole("link", { name: "XLSX", exact: true }).click();
  const xlsx = await xlsxDownload;
  expect(xlsx.suggestedFilename()).toBe("shipments.xlsx");
  const sheet = await readSheet(await readFile((await xlsx.path())!));
  expect(sheet[1][0]).toBe("E2ETRACK00001");
  await page.getByRole("link", { name: "E2ETRACK00001", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "E2ETRACK00001" }),
  ).toBeVisible();
  await expect(page.getByText("Tracking timeline")).toBeVisible();
  await page.goto("/action-required");
  const ack = page
    .getByRole("button", { name: "Acknowledge", exact: true })
    .first();
  await expect(ack).toBeVisible();
  {
    await ack.click();
    await expect(
      page.getByRole("button", { name: "Acknowledged" }).first(),
    ).toBeDisabled();
  }
  await page.goto("/settings");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByRole("status")).toContainText("Settings saved");
  const csrf = await page.request.post("/api/settings", { data: {} });
  expect(csrf.status()).toBe(403);
  await page.goto("/dashboard");
  await expect(
    page.getByRole("heading", { name: "Shipment overview" }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/dashboard-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: "test-results/dashboard-mobile.png",
    fullPage: true,
  });
  expect(errors).toEqual([]);
});
