import {
  test,
  expect,
  _electron as electron,
  type ElectronApplication,
  type Page,
} from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  access,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import "../../src/shared/types";
let application: ElectronApplication, page: Page, root: string, profile: string;
test.beforeEach(async ({}, testInfo) => {
  const temp = process.platform === "darwin" ? "/tmp" : os.tmpdir();
  root = await mkdtemp(path.join(temp, "spacescan-e2e-fixture-"));
  profile = await mkdtemp(path.join(temp, "spacescan-e2e-profile-"));
  await mkdir(path.join(root, "Photos"));
  await mkdir(path.join(root, "Empty"));
  await writeFile(path.join(root, "Photos", "holiday.jpg"), Buffer.alloc(8192));
  await writeFile(path.join(root, "notes.md"), "SpaceScan test");
  await writeFile(path.join(root, "=SUM(1,2).txt"), "CSV export");
  const executablePath =
    process.env.SPACESCAN_TEST_EXECUTABLE ??
    testInfo.project.metadata.executablePath;
  application = await electron.launch({
    executablePath,
    args: [...(executablePath ? [] : ["."]), `--user-data-dir=${profile}`],
    env: { ...process.env, SPACESCAN_TEST_PROFILE: profile },
  });
  page = await application.firstWindow();
  await expect(
    page.getByRole("heading", { name: "发现空间的去向" }),
  ).toBeVisible();
  await application.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, root);
});
test.afterEach(async () => {
  await application?.close().catch(() => {});
  await rm(root, { recursive: true, force: true });
  await rm(profile, { recursive: true, force: true });
});
async function scan() {
  await page.getByRole("button", { name: "选择文件夹", exact: true }).click();
  await expect(page.getByText("扫描完成", { exact: false })).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(4);
}
test("real disk scan, treemap, navigation, search and selection work together", async () => {
  await scan();
  await expect(page.getByTestId("treemap")).toBeVisible();
  await page
    .getByRole("button", { name: "进入文件夹: Photos", exact: true })
    .click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.locator("tbody tr").first().click();
  await expect(page.locator(".inspector h3")).toHaveText("holiday.jpg");
  await page.getByRole("button", { name: "上一级", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page
    .getByRole("textbox", { name: "搜索整个扫描中的名称…" })
    .fill("holiday");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "清除", exact: true }).first().click();
  await page
    .getByRole("button", { name: "进入文件夹: Empty", exact: true })
    .click();
  await expect(page.getByText("这个文件夹是空的")).toBeVisible();
});
test("renderer isolation and IPC validation reject unapproved paths and stale IDs", async () => {
  expect(
    await page.evaluate(
      () => typeof (window as unknown as { require?: unknown }).require,
    ),
  ).toBe("undefined");
  const result = await page.evaluate(async () => {
    try {
      await window.spacescan.scan("/definitely-not-approved");
      return false;
    } catch {
      return true;
    }
  });
  expect(result).toBe(true);
  await scan();
  const state = await page.evaluate(() => window.spacescan.summary());
  expect(state?.files).toBe(3);
  expect(
    await page.evaluate(async () => {
      try {
        await window.spacescan.details(0, "stale-scan");
        return false;
      } catch {
        return true;
      }
    }),
  ).toBe(true);
  const runtime = await page.evaluate(() => window.spacescan.runtime);
  expect(runtime.contextIsolated).toBe(true);
  expect(runtime.sandboxed).toBe(true);
});
test("CSV export uses current search results and preserves file data", async () => {
  const destination = path.join(profile, "result.csv");
  await application.evaluate(({ dialog }, file) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
  }, destination);
  await scan();
  await page
    .getByRole("textbox", { name: "搜索整个扫描中的名称…" })
    .fill("notes");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page.getByRole("button", { name: "导出 CSV" }).click();
  await expect(page.getByRole("status")).toContainText("CSV 已导出");
  const csv = await readFile(destination, "utf8");
  expect(csv).toContain("notes.md");
  expect(csv).not.toContain("holiday.jpg");
  expect(await readFile(path.join(root, "notes.md"), "utf8")).toBe(
    "SpaceScan test",
  );
});
test("Trash requires confirmation; cancelling leaves the file intact", async () => {
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 0,
      checkboxChecked: false,
    });
  });
  await scan();
  await page.locator("tbody tr").filter({ hasText: "notes.md" }).click();
  await page.getByRole("button", { name: "移到回收站", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "移到回收站", exact: true }),
  ).toBeEnabled();
  expect(await readFile(path.join(root, "notes.md"), "utf8")).toBe(
    "SpaceScan test",
  );
});
test("confirmed cleanup uses real OS Trash and refreshes the scan", async () => {
  await application.evaluate(({ dialog }) => {
    dialog.showMessageBox = async () => ({
      response: 1,
      checkboxChecked: false,
    });
  });
  await scan();
  await page.locator("tbody tr").filter({ hasText: "notes.md" }).click();
  await page.getByRole("button", { name: "移到回收站", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(access(path.join(root, "notes.md"))).rejects.toThrow();
  // The tiny fixture remains recoverable in OS Trash; tests never empty Trash.
});
test("appearance, language and keyboard navigation survive a reload", async () => {
  const settings = page.getByRole("button", { name: "偏好设置", exact: true });
  await settings.focus();
  await settings.press("Enter");
  await page
    .getByRole("combobox", { name: "语言", exact: true })
    .selectOption("en");
  await page
    .getByRole("combobox", { name: "Appearance", exact: true })
    .selectOption("light");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Make room for what matters" }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Make room for what matters" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});

test("minimum desktop size keeps navigation, map and footer inside the window", async ({}, testInfo) => {
  await scan();
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0]!.setSize(980, 650),
  );
  await expect
    .poll(async () => page.evaluate(() => window.innerWidth))
    .toBeLessThanOrEqual(980);
  await page.keyboard.press("ControlOrMeta+f");
  await expect(
    page.getByRole("textbox", { name: "搜索整个扫描中的名称…" }),
  ).toBeFocused();
  const geometry = await page.evaluate(() => {
    const footer = document
      .querySelector(".app-footer")!
      .getBoundingClientRect();
    const map = document.querySelector(".treemap")!.getBoundingClientRect();
    const list = document
      .querySelector(".file-table-wrap")!
      .getBoundingClientRect();
    const row = document.querySelector("tbody tr")!.getBoundingClientRect();
    const pagination = document
      .querySelector(".pagination")!
      .getBoundingClientRect();
    const explorer = document
      .querySelector(".explorer")!
      .getBoundingClientRect();
    return {
      width: innerWidth,
      height: innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      footerBottom: footer.bottom,
      mapWidth: map.width,
      mapHeight: map.height,
      listBottom: list.bottom,
      firstRowBottom: row.bottom,
      paginationBottom: pagination.bottom,
      explorerBottom: explorer.bottom,
    };
  });
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.width);
  expect(geometry.footerBottom).toBeLessThanOrEqual(geometry.height);
  expect(geometry.mapHeight).toBeGreaterThan(60);
  expect(geometry.mapWidth).toBeGreaterThan(200);
  expect(geometry.firstRowBottom).toBeLessThanOrEqual(geometry.listBottom);
  expect(geometry.paginationBottom).toBeLessThanOrEqual(
    geometry.explorerBottom,
  );
  await page.screenshot({ path: testInfo.outputPath("minimum-window.png") });
});
