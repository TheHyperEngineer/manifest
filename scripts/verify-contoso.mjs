import { chromium } from "playwright";

const filePath = "C:\\Users\\chaud\\Documents\\poc-projects\\manifest\\Contoso.docx";

const browser = await chromium.launch({
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});

const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
const errors = [];

page.on("console", (msg) => {
  if (msg.type() === "error") errors.push("console:" + msg.text());
});
page.on("pageerror", (err) => {
  errors.push("page:" + String(err.message || err));
});

try {
  await page.goto("http://127.0.0.1:8080/studio", {
    waitUntil: "domcontentloaded",
    timeout: 45000,
  });

  const importTab = page.getByRole("button", { name: /Import file/i });
  if ((await importTab.count()) > 0) {
    await importTab.click();
  }

  await page.waitForTimeout(1200);

  const uploadButton = page.getByRole("button", { name: /Upload document|Choose file/i }).first();
  if ((await uploadButton.count()) > 0) {
    await uploadButton.click();
  }

  const fileInput = page.locator('input[type="file"]').first();
  if ((await fileInput.count()) > 0) {
    await fileInput.setInputFiles(filePath);
  } else {
    throw new Error("No file input present in the Studio import panel.");
  }

  const saveButton = page.getByRole("button", { name: /Save digital version/i });
  await saveButton.waitFor({ timeout: 30000, state: "visible" });

  const finalBody = await page.locator("body").innerText();
  const saveCount = await saveButton.count();

  console.log(
    JSON.stringify(
      {
        final: {
          saveCount,
          hasDraft: /Draft ready|Invoice form|Line items|Vendor|Invoice #/i.test(finalBody),
          bodySnippet: finalBody.slice(0, 2000),
        },
        errors,
      },
      null,
      2,
    ),
  );
} catch (error) {
  const finalBody = await page.locator("body").innerText();
  console.log(
    JSON.stringify(
      {
        final: {
          saveCount: 0,
          hasDraft: false,
          bodySnippet: finalBody.slice(0, 2000),
        },
        errors: [...errors, String(error instanceof Error ? error.message : error)],
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await browser.close();
}
