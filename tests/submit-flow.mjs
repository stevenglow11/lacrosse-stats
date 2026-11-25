import { createServer } from "node:http";
import { mkdir, copyFile } from "node:fs/promises";
import { join } from "node:path";
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";
import { createGasApp } from "./gas-harness.mjs";
import { readFile } from "node:fs/promises";
import { extname, normalize } from "node:path";

const ROOT = "/workspace";
const PREFIX = "/lacrosse-stats";
const PASS = "field-test-code";
const SHOTS = "/tmp/lax-shots";
const ARTIFACTS = "/opt/cursor/artifacts";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
};

function startSite() {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://127.0.0.1");
      if (!url.pathname.startsWith(PREFIX)) {
        res.writeHead(404);
        res.end("missing");
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
      res.writeHead(200, { "content-type": TYPES[extname(path)] || "application/octet-stream", "cache-control": "no-cache" });
      res.end(body);
    } catch {
      res.writeHead(404);
      res.end("missing");
    }
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

function startSheet() {
  const gas = createGasApp(PASS);
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }
    if (url.pathname !== "/exec") {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    if (req.method === "GET") {
      const out = gas.get(Object.fromEntries(url.searchParams.entries()));
      const type = out.mime === "application/javascript" ? "application/javascript; charset=utf-8" : "application/json; charset=utf-8";
      res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
      res.end(out.text);
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const text = Buffer.concat(chunks).toString("utf8");
    let body = {};
    try { body = JSON.parse(text); } catch { body = {}; }
    const out = gas.post(body);
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(out));
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, gas })));
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
  const site = await startSite();
  const sheet = await startSheet();
  const sitePort = site.address().port;
  const sheetPort = sheet.server.address().port;
  const appUrl = `http://127.0.0.1:${sitePort}${PREFIX}/`;
  const submitUrl = `http://127.0.0.1:${sheetPort}/exec`;
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
  await context.addInitScript(`window.__LAX_SUBMIT_URL__ = ${JSON.stringify(submitUrl)};`);
  const page = await context.newPage();
  page.setDefaultTimeout(10000);
  try {
    await page.goto(appUrl);
    await page.getByRole("button", { name: "Games", exact: true }).click();
    await page.getByRole("button", { name: "New game", exact: true }).click();
    await page.getByLabel("Opponent").fill("Summit");
    await page.getByLabel("Date").fill("2026-04-18");
    await page.getByLabel(/Location/).fill("Ridge Turf");
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await page.getByRole("button", { name: "Number 2, Christopher Raichle", exact: true }).click();
    await page.getByRole("button", { name: "Goal", exact: true }).click();
    await page.getByRole("button", { name: "Skip assist", exact: true }).click();

    await page.getByRole("button", { name: "Submit results", exact: true }).click();
    await page.getByRole("textbox", { name: "Results passcode" }).fill(PASS);
    await page.getByRole("button", { name: "Save passcode", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Submitted" }).waitFor();

    const posted = JSON.parse(sheet.gas.get().text);
    assert.equal(posted.teams.find((team) => team.id === "team91").games[0].opponent, "Summit");
    assert.equal(JSON.stringify(sheet.gas.rows()).includes(PASS), false);

    await page.goto(`${appUrl}results.html`);
    await page.getByRole("button", { name: /Summit/ }).waitFor();
    assert.match(await page.getByTestId("public-record").innerText(), /1-0-0/);
    await shot(page, "results_submit_list.png");
    await page.getByRole("button", { name: /Summit/ }).click();
    await page.getByTestId("public-quarters").waitFor();
    assert.match(await page.getByTestId("public-box").innerText(), /Christopher Raichle/);
    await shot(page, "results_submit_game.png");

    await page.goto(appUrl);
    await page.getByRole("button", { name: "Games", exact: true }).click();
    await context.setOffline(true);
    await page.getByRole("button", { name: "On the public page", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "offline" }).waitFor();
    await context.setOffline(false);
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await page.getByRole("status").filter({ hasText: "Sent saved results" }).waitFor();
    const afterHide = JSON.parse(sheet.gas.get().text);
    assert.equal(afterHide.teams.find((team) => team.id === "team91").games.length, 0);
    console.log("SUBMIT FLOW PASSED");
  } finally {
    await browser.close();
    site.close();
    sheet.server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
