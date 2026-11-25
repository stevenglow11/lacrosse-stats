import { createServer } from "node:http";
import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";

const ROOT = "/workspace";
const PREFIX = "/lacrosse-stats";
const RESULTS_FILE = join(ROOT, "results.json");
const SHOTS = "/tmp/lax-shots";
const ARTIFACTS = "/opt/cursor/artifacts";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

function startServer() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (!url.pathname.startsWith(PREFIX)) {
        res.writeHead(404);
        res.end("not found");
        return;
      }
      let rel = decodeURIComponent(url.pathname.slice(PREFIX.length)).replace(/^\/+/, "");
      if (!rel || rel.endsWith("/")) rel = `${rel}index.html`;
      const path = normalize(join(ROOT, rel));
      if (path !== ROOT && !path.startsWith(`${ROOT}/`)) {
        res.writeHead(403);
        res.end("no");
        return;
      }
      const body = await readFile(path);
      res.writeHead(200, {
        "content-type": TYPES[extname(path)] || "application/octet-stream",
        "cache-control": "no-cache",
      });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("missing");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

async function shot(page, name) {
  await page.evaluate(() => window.scrollTo(0, 0));
  const path = join(SHOTS, name);
  await page.screenshot({ path });
  await copyFile(path, join(ARTIFACTS, name));
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
  await mkdir(ARTIFACTS, { recursive: true });
  const emptySeed = await readFile(RESULTS_FILE, "utf8");
  const server = await startServer();
  const { port } = server.address();
  const base = `http://127.0.0.1:${port}${PREFIX}/`;
  const browser = await chromium.launch();
  const iphone = devices["iPhone 13"];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    colorScheme: "light",
    locale: "en-US",
    userAgent: iphone.userAgent,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(8000);
  try {
    await page.goto(`${base}results.html`);
    await page.getByTestId("empty-results").waitFor();
    assert.match(await page.locator("body").innerText(), /No games published yet/);
    assert.equal(await page.getByText("Summit").count(), 0);

    await page.goto(base);
    await page.getByRole("button", { name: "Games", exact: true }).click();
    await page.getByRole("button", { name: "New game", exact: true }).click();
    await page.getByLabel("Opponent").fill("Summit");
    await page.getByLabel("Date").fill("2026-04-18");
    await page.getByLabel(/Location/).fill("Ridge Turf");
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await page.getByRole("button", { name: "Number 2, Christopher Raichle", exact: true }).click();
    await page.getByRole("button", { name: "Goal", exact: true }).click();
    await page.getByRole("button", { name: "Skip assist", exact: true }).click();
    await page.getByRole("button", { name: "Opponent goal", exact: true }).click();
    await page.getByRole("button", { name: "Quarter 2", exact: true }).click();
    await page.getByRole("button", { name: "Number 3, Weston Brandt", exact: true }).click();
    await page.getByRole("button", { name: "Goal", exact: true }).click();
    await page.getByRole("button", { name: "Skip assist", exact: true }).click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Submit results", exact: true }).click(),
    ]);
    const exportedPath = "/tmp/results-export.json";
    await download.saveAs(exportedPath);
    const exported = await readFile(exportedPath, "utf8");
    const payload = JSON.parse(exported);
    assert.equal(payload.teams.find((team) => team.id === "team91").games.length, 1);
    assert.equal(payload.teams.find((team) => team.id === "team91").games[0].result, "W");
    assert.equal(payload.teams.find((team) => team.id === "brick56").games.length, 0);
    const keys = [];
    const walk = (value) => {
      if (!value || typeof value !== "object") return;
      for (const key of Object.keys(value)) {
        keys.push(key);
        walk(value[key]);
      }
    };
    walk(payload);
    for (const banned of ["events", "playerId", "goalEventId", "token", "secret"]) {
      assert.equal(keys.includes(banned), false, banned);
    }
    await writeFile(RESULTS_FILE, exported);

    await page.goto(`${base}results.html?check=${Date.now()}`);
    await page.getByRole("button", { name: /Summit/ }).waitFor();
    assert.match(await page.getByTestId("public-record").innerText(), /1-0-0/);
    assert.match(await page.locator("body").innerText(), /Season leaders/);
    assert.match(await page.locator("body").innerText(), /Christopher Raichle/);
    await shot(page, "results_list.png");

    await page.getByRole("button", { name: /Summit/ }).click();
    await page.getByTestId("public-quarters").waitFor();
    const quarters = (await page.getByTestId("public-quarters").innerText()).replace(/\s+/g, " ");
    assert.match(quarters, /Us 1 1 0 0 2/);
    assert.match(quarters, /Them 1 0 0 0 1/);
    assert.match(await page.getByTestId("public-box").innerText(), /Christopher Raichle/);
    assert.match(await page.getByTestId("public-box").innerText(), /Weston Brandt/);
    assert.match(await page.locator("body").innerText(), /Ridge Turf/);
    await shot(page, "results_game.png");

    await page.getByRole("button", { name: "Brick 5/6", exact: true }).click();
    await page.getByTestId("empty-results").waitFor();
    console.log("RESULTS PAGE PASSED");
  } finally {
    await writeFile(RESULTS_FILE, emptySeed);
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
