import fs from "node:fs";
import { chromium, type Page } from "playwright";
import { getDb, upsertRfqs } from "../src/lib/db";
import { parseRfqGrid } from "../src/lib/dibbs-parse";

const START = "https://www.dibbs.bsm.dla.mil/RFQ/RfqDates.aspx?category=issue";
const DEFAULT_CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe";

function arg(name: string): number | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : undefined;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function acceptConsent(page: Page) {
  if (page.url().toLowerCase().includes("dodwarning")) {
    console.log("DoD consent page; clicking #butAgree");
    await Promise.all([page.waitForNavigation({ waitUntil: "load" }), page.click("#butAgree")]);
  }
}

const firstRowNum = (page: Page) =>
  page
    .locator("#ctl00_cph1_grdRfqSearch_ctl03_lblRowNum")
    .first()
    .textContent()
    .catch(() => null);

async function goToPage(page: Page, n: number) {
  const before = await firstRowNum(page);
  await page.evaluate(
    (p) => (window as unknown as { __doPostBack: (a: string, b: string) => void }).__doPostBack("ctl00$cph1$grdRfqSearch", "Page$" + p),
    n,
  );
  await page.waitForLoadState("load");
  for (let i = 0; i < 100; i++) {
    const now = await firstRowNum(page);
    if (now && now !== before) return;
    await sleep(100);
  }
  throw new Error(`page ${n}: first row number did not change`);
}

async function main() {
  const days = arg("days") ?? 1;
  const maxPages = arg("max-pages") ?? Infinity;
  const chromePath = process.env.CHROME_PATH ?? (fs.existsSync(DEFAULT_CHROME) ? DEFAULT_CHROME : undefined);
  const browser = await chromium.launch({ headless: true, executablePath: chromePath });
  const page = await (await browser.newContext()).newPage();
  page.setDefaultTimeout(30000);
  let total = 0;
  try {
    await page.goto(START, { waitUntil: "load" });
    await acceptConsent(page);
    if (!page.url().includes("RfqDates")) await page.goto(START, { waitUntil: "load" });
    const hrefs = await page.$$eval("a", (as) =>
      as.map((a) => (a as HTMLAnchorElement).href).filter((h) => /RfqRecs\.aspx/i.test(h)),
    );
    const dateLinks = [...new Set(hrefs)].slice(0, days);
    console.log(`found ${hrefs.length} date links; scraping ${dateLinks.length}`);

    for (const link of dateLinks) {
      console.log(`date: ${link}`);
      await page.goto(link, { waitUntil: "load" });
      await acceptConsent(page);
      const body = await page.content();
      const found = Number(body.match(/Records Found:\s*(?:<[^>]+>\s*)*([\d,]+)/i)?.[1].replace(/,/g, "") ?? 0);
      let pageNo = 1;
      let dayRows = 0;
      for (;;) {
        const rows = parseRfqGrid(await page.content());
        upsertRfqs(rows);
        dayRows += rows.length;
        total += rows.length;
        console.log(`  page ${pageNo}: ${rows.length} rows (day ${dayRows}/${found})`);
        if (!rows.length || dayRows >= found || pageNo >= maxPages) break;
        await sleep(300);
        const next = pageNo + 1;
        try {
          await goToPage(page, next);
        } catch (e) {
          console.log(`  retry page ${next}: ${(e as Error).message}`);
          await sleep(1000);
          try {
            await goToPage(page, next);
          } catch (e2) {
            console.log(`  page ${next} failed twice, stopping day: ${(e2 as Error).message}`);
            break;
          }
        }
        pageNo = next;
      }
    }
  } finally {
    await browser.close();
  }
  const count = (getDb().prepare("SELECT COUNT(*) c FROM rfqs").get() as { c: number }).c;
  console.log(`done: ${total} rows upserted, ${count} rows in DB`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
