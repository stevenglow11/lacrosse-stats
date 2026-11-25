import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { mkdir, copyFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { chromium, devices } from "playwright";

const ROOT = "/workspace";
const PREFIX = "/lacrosse-stats";
const SHOTS = "/tmp/lax-shots";
const ARTIFACTS = "/opt/cursor/artifacts";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
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
  await page.screenshot({ path: join(SHOTS, name) });
}

async function main() {
  await mkdir(SHOTS, { recursive: true });
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
  const pageErrors = [];
  const badResponses = [];
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("response", (response) => {
    if (response.status() >= 400) badResponses.push(`${response.status()} ${response.url()}`);
  });

  const player = (name) => page.getByRole("button", { name, exact: true });
  const stat = (name) => page.getByRole("button", { name, exact: true });

  async function tapPlayer(name) {
    const button = player(name);
    await button.scrollIntoViewIfNeeded();
    await button.click();
  }
  async function tapStat(name) {
    await stat(name).click();
  }
  async function cell(tableId, name, key) {
    const loc = page.locator(`[data-testid="${tableId}"] [data-player="${name}"] [data-stat="${key}"]`);
    return (await loc.innerText()).trim();
  }

  try {
    await page.goto(base);
    await page.getByRole("button", { name: "Roster" }).click();
    await page.getByRole("heading", { name: "Roster" }).waitFor();

    const names = await page.locator("[data-testid=roster-player]").evaluateAll((rows) => rows.map((row) => row.dataset.name));
    assert.equal(names.length, 25);
    for (const name of ["Ecke", "Christopher Raichle", "Luke", "Lucas", "Bradly", "Bill", "James Brunner", "Jose (Manny) Cruz", "Russell Steenweg III"]) {
      assert.ok(names.includes(name), name);
    }
    assert.equal(await page.getByTestId("dup-banner").count(), 0);
    assert.equal((await page.locator("[data-name='Carter Glowacki'] .jersey").innerText()).trim(), "43");
    assert.equal((await page.locator("[data-name='Jack Donlan'] .jersey").innerText()).trim(), "33");

    await page.getByRole("button", { name: "Edit Jack Donlan", exact: true }).click();
    const warning = page.locator("#number-warning");
    await warning.waitFor({ state: "hidden" });
    await page.locator("#player-number").fill("43");
    await warning.waitFor({ state: "visible" });
    assert.match(await warning.innerText(), /Carter Glowacki/);
    await page.locator("#player-number").fill("48");
    await warning.waitFor({ state: "hidden" });
    await page.locator("#player-number").fill("49");
    await warning.waitFor({ state: "visible" });
    assert.match(await warning.innerText(), /Gavin Doyle/);
    await page.getByRole("button", { name: "Cancel" }).click();
    assert.equal((await page.locator("[data-name='Jack Donlan'] .jersey").innerText()).trim(), "33");
    await shot(page, "roster_screen.png");

    await page.getByRole("button", { name: "Brick 5/6", exact: true }).click();
    await page.getByText("No players yet").waitFor();
    assert.equal(await page.locator("[data-testid=roster-player]").count(), 0);
    assert.equal(await page.getByText("Raichle").count(), 0);
    await page.getByRole("button", { name: "Team 91 2033", exact: true }).click();
    assert.equal(await page.locator("[data-testid=roster-player]").count(), 25);

    await page.getByRole("button", { name: "Games", exact: true }).click();
    await page.getByRole("button", { name: "New game", exact: true }).click();
    await page.getByLabel("Opponent").fill("Summit");
    await page.getByLabel("Date").fill("2026-04-18");
    await page.getByLabel(/Location/).fill("Ridge Turf");
    await page.getByRole("button", { name: "Home", exact: true }).click();
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await page.getByTestId("score-us").waitFor();

    await tapPlayer("Number 2, Christopher Raichle");
    await tapStat("Goal");
    await tapPlayer("Number 3, Weston Brandt");
    await tapStat("Opponent goal");
    await tapPlayer("Number 13, Lucas");
    await tapStat("Ground ball");
    await tapPlayer("Number 32, Jake Lopes");
    await tapStat("Shot");
    await tapPlayer("Number 43, Carter Glowacki");
    await tapStat("Shot on goal");
    await tapPlayer("Number 1, Ecke");
    await tapStat("Faceoff win");
    await tapPlayer("Number 27, Luke");
    await tapStat("Faceoff loss");
    assert.equal((await page.getByTestId("score-us").innerText()).trim(), "1");
    assert.equal((await page.getByTestId("score-them").innerText()).trim(), "1");

    await page.getByRole("button", { name: "Quarter 2", exact: true }).click();
    await tapPlayer("Number 99, Keegan Glowacki");
    await tapStat("Goal");
    await page.getByRole("button", { name: "Skip assist", exact: true }).click();
    await tapStat("Opponent goal");
    await tapStat("Opponent goal");
    await tapPlayer("Number 49, Gavin Doyle");
    await tapStat("Caused turnover");
    await tapPlayer("Number 12, Logan Eichner");
    await tapStat("Turnover");
    await tapPlayer("Number 33, Jack Donlan");
    await tapStat("Goal");
    await tapPlayer("Number 16, JP Fernandez-Castaneda");
    await page.getByRole("button", { name: "Undo last event", exact: true }).click();
    await tapPlayer("Number 27, Luke");
    await tapStat("Assist");

    await page.getByRole("button", { name: "Quarter 3", exact: true }).click();
    await tapPlayer("Number 81, Jose (Manny) Cruz");
    await tapStat("Ground ball");
    await tapPlayer("Number 10, Michael Tricarico");
    await tapStat("Penalty");
    await page.getByRole("button", { name: "2:00", exact: true }).click();
    await tapPlayer("No number, Bill");
    await tapStat("Save");
    await tapStat("Save");
    await tapPlayer("No number, James Brunner");
    await tapStat("Goal against");
    await tapPlayer("Number 7, Declan Marron");
    await tapStat("Shot");
    await tapPlayer("Number 5, Ryker Dimitrakakis");
    await tapStat("Caused turnover");
    await page.getByRole("button", { name: "Delete Caused turnover by #5 Ryker Dimitrakakis", exact: true }).click();
    await page.getByRole("button", { name: "Delete event", exact: true }).click();

    await page.getByRole("button", { name: "Quarter 4", exact: true }).click();
    await tapPlayer("Number 29, Grayson Kowaliwskyj");
    await tapStat("Goal");
    await tapPlayer("Number 27, Luke");
    await page.getByRole("button", { name: "Clear selection", exact: true }).click();
    await tapStat("Ground ball");
    await tapPlayer("Number 17, Thomas Heckler");
    await tapPlayer("Number 22, Jaxon Butts");
    await tapStat("Faceoff win");
    await tapPlayer("Number 23, Russell Steenweg III");
    await tapStat("Faceoff loss");
    await tapPlayer("Number 15, Jake Carey");
    await tapStat("Turnover");
    await tapPlayer("Number 25, Teddy Fittante");
    await tapStat("Shot on goal");
    await tapStat("Opponent goal");
    await page.getByRole("button", { name: "Edit Shot on goal by #25 Teddy Fittante", exact: true }).click();
    await page.getByRole("button", { name: "Goal", exact: true }).click();
    await page.getByRole("button", { name: "Save event", exact: true }).click();
    await page.getByRole("status").waitFor({ state: "hidden", timeout: 4000 }).catch(() => {});

    assert.equal((await page.getByTestId("score-us").innerText()).trim(), "5");
    assert.equal((await page.getByTestId("score-them").innerText()).trim(), "4");
    assert.equal((await page.getByTestId("quarter-label").innerText()).trim(), "Q4");
    assert.match(await page.getByTestId("feed").innerText(), /Opponent goal/);

    const goal = await page.getByRole("button", { name: "Goal", exact: true }).boundingBox();
    assert.ok(goal && goal.height >= 44 && goal.width >= 44, "goal target");
    const ecke = player("Number 1, Ecke");
    await ecke.scrollIntoViewIfNeeded();
    const eckeBox = await ecke.boundingBox();
    assert.ok(eckeBox && eckeBox.height >= 44 && eckeBox.width >= 44, "player target");
    await shot(page, "live_entry_screen.png");

    await page.getByRole("button", { name: "Box score", exact: true }).click();
    await page.getByTestId("quarter-score").waitFor();
    const quarters = (await page.getByTestId("quarter-score").innerText()).replace(/\s+/g, " ");
    assert.match(quarters, /Us 1 2 0 2 5/);
    assert.match(quarters, /Them 1 2 0 1 4/);
    assert.match(await page.locator(".lede").innerText(), /Ridge Turf/);
    assert.match(await page.locator(".lede").innerText(), /Home/);

    const expectStat = async (name, key, value) => {
      assert.equal(await cell("box-table", name, key), value, `${name} ${key}`);
    };
    await expectStat("Christopher Raichle", "g", "1");
    await expectStat("Christopher Raichle", "sh", "1");
    await expectStat("Christopher Raichle", "sog", "1");
    await expectStat("Jake Lopes", "sh", "1");
    await expectStat("Jake Lopes", "sog", "0");
    await expectStat("Carter Glowacki", "sog", "1");
    await expectStat("Carter Glowacki", "g", "0");
    await expectStat("Teddy Fittante", "g", "1");
    await expectStat("Teddy Fittante", "sh", "1");
    await expectStat("Teddy Fittante", "sog", "1");
    await expectStat("Luke", "a", "2");
    await expectStat("Luke", "fol", "1");
    await expectStat("Weston Brandt", "a", "1");
    await expectStat("JP Fernandez-Castaneda", "a", "0");
    await expectStat("Lucas", "gb", "1");
    await expectStat("Jose (Manny) Cruz", "gb", "1");
    await expectStat("Thomas Heckler", "gb", "1");
    await expectStat("Gavin Doyle", "ct", "1");
    await expectStat("Ryker Dimitrakakis", "ct", "0");
    await expectStat("Logan Eichner", "to", "1");
    await expectStat("Jake Carey", "to", "1");
    await expectStat("Bill", "sv", "2");
    await expectStat("James Brunner", "ga", "1");
    await expectStat("Michael Tricarico", "pim", "2");
    await expectStat("Ecke", "fow", "1");
    await expectStat("Jaxon Butts", "fow", "1");
    await expectStat("Russell Steenweg III", "fol", "1");
    await expectStat("Totals", "g", "5");
    await expectStat("Totals", "a", "3");
    await expectStat("Totals", "sh", "8");
    await expectStat("Totals", "sog", "6");
    await expectStat("Totals", "shPct", "62.5%");
    await expectStat("Totals", "gb", "3");
    await expectStat("Totals", "ct", "1");
    await expectStat("Totals", "to", "2");
    await expectStat("Totals", "fow", "2");
    await expectStat("Totals", "fol", "2");
    await expectStat("Totals", "foPct", "50%");
    await expectStat("Totals", "sv", "2");
    await expectStat("Totals", "ga", "1");
    await expectStat("Totals", "svPct", "66.7%");
    await expectStat("Totals", "pim", "2");
    await shot(page, "box_score_screen.png");

    await page.getByRole("button", { name: "Stats", exact: true }).click();
    await page.getByTestId("metric-record").waitFor();
    assert.match(await page.getByTestId("metric-record").innerText(), /1-0-0/);
    assert.match(await page.getByTestId("metric-gf").innerText(), /5/);
    assert.match(await page.getByTestId("metric-ga").innerText(), /4/);
    assert.match(await page.getByTestId("metric-sh").innerText(), /62\.5%/);
    assert.match(await page.getByTestId("metric-fo").innerText(), /50%/);
    assert.match(await page.getByTestId("metric-sv").innerText(), /66\.7%/);
    assert.equal(await cell("season-table", "Christopher Raichle", "g"), "1");
    assert.equal(await cell("season-table", "Christopher Raichle", "gp"), "1");
    assert.equal(await cell("season-table", "Totals", "g"), "5");
    await shot(page, "season_stats_screen.png");

    await page.getByRole("button", { name: "Per game", exact: true }).click();
    assert.equal(await cell("season-table", "JP Fernandez-Castaneda", "g"), "—");
    assert.equal(await cell("season-table", "Christopher Raichle", "g"), "1");
    await page.getByRole("button", { name: "Totals", exact: true }).click();

    await page.getByRole("button", { name: "Leaders", exact: true }).click();
    const assists = page.locator(".panel", { has: page.getByRole("heading", { name: "Assists", exact: true }) });
    assert.match(await assists.innerText(), /Luke/);
    assert.match(await assists.innerText(), /2/);
    const shooting = page.locator(".panel", { has: page.getByRole("heading", { name: "Shooting %", exact: true }) });
    assert.match(await shooting.innerText(), /Christopher Raichle/);
    assert.match(await shooting.innerText(), /100% · 1\/1/);

    await page.getByRole("button", { name: "Players", exact: true }).click();
    await page.locator("#log-player").selectOption({ label: "Number 2, Christopher Raichle" });
    const log = page.getByTestId("player-log");
    assert.match(await log.innerText(), /Summit/);
    assert.match(await page.locator(".view .lede").nth(1).innerText(), /1 goal/);

    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("laxstats.v1")));
    assert.equal(saved.games.length, 1);
    assert.equal(saved.teams.find((team) => team.id === "brick56").players.length, 0);
    await page.reload();
    await page.getByRole("button", { name: "Live", exact: true }).click();
    assert.equal((await page.getByTestId("score-us").innerText()).trim(), "5");
    assert.equal((await page.getByTestId("score-them").innerText()).trim(), "4");
    const again = await page.evaluate(() => JSON.parse(localStorage.getItem("laxstats.v1")).games[0].events.length);
    assert.ok(again > 10);

    await page.getByRole("button", { name: "Stats", exact: true }).click();
    const [csvDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export season CSV", exact: true }).click(),
    ]);
    const csvPath = "/tmp/season.csv";
    await csvDownload.saveAs(csvPath);
    const csv = await readFile(csvPath, "utf8");
    assert.match(csv, /Team 91 2033/);
    assert.match(csv, /Christopher Raichle/);
    assert.match(csv, /Jose \(Manny\) Cruz/);
    assert.match(csv, /1-0-0/);
    assert.match(csv, /Per game averages/);

    await page.getByRole("button", { name: "Games", exact: true }).click();
    await page.getByRole("button", { name: "Box score", exact: true }).click();
    const [gameDownload] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export this game", exact: true }).click(),
    ]);
    const gameCsvText = await readFile(await gameDownload.path(), "utf8");
    assert.match(gameCsvText, /Summit/);
    assert.match(gameCsvText, /Ridge Turf/);
    assert.match(gameCsvText, /Teddy Fittante/);

    await page.getByRole("button", { name: "Games", exact: true }).click();
    const [backup] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Download backup", exact: true }).click(),
    ]);
    const backupPath = "/tmp/lax-backup.json";
    await backup.saveAs(backupPath);
    await page.getByRole("button", { name: "New game", exact: true }).click();
    await page.getByLabel("Opponent").fill("DELETE ME");
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await page.getByRole("button", { name: "Games", exact: true }).click();
    assert.match(await page.locator("body").innerText(), /DELETE ME/);
    const [chooser] = await Promise.all([
      page.waitForEvent("filechooser"),
      page.getByRole("button", { name: "Restore backup", exact: true }).click(),
    ]);
    await chooser.setFiles(backupPath);
    await page.getByRole("button", { name: "Replace data", exact: true }).click();
    await page.getByText("Backup restored").waitFor();
    assert.equal(await page.getByText("DELETE ME").count(), 0);
    await page.getByRole("button", { name: "Live", exact: true }).click();
    assert.equal((await page.getByTestId("score-us").innerText()).trim(), "5");

    await page.getByRole("button", { name: "Brick 5/6", exact: true }).click();
    await page.getByRole("button", { name: "Roster", exact: true }).click();
    assert.equal(await page.locator("[data-testid=roster-player]").count(), 0);
    await page.getByRole("button", { name: "Add player", exact: true }).click();
    await page.getByLabel("First name").fill("Alex");
    await page.getByLabel("Last name").fill("Rivera");
    await page.locator("#player-number").fill("8");
    await page.locator("select[name=position]").selectOption("M");
    await page.getByRole("button", { name: "Add player", exact: true }).click();
    await page.getByText("Roster saved").waitFor();
    assert.equal(await page.locator("[data-testid=roster-player]").count(), 1);
    await page.getByRole("button", { name: "Games", exact: true }).click();
    await page.getByRole("button", { name: "New game", exact: true }).click();
    await page.getByLabel("Opponent").fill("Ocean");
    await page.getByRole("button", { name: "Away", exact: true }).click();
    await page.getByRole("button", { name: "Start game", exact: true }).click();
    await tapPlayer("Number 8, Alex Rivera");
    await tapStat("Goal");
    await page.getByRole("button", { name: "Skip assist", exact: true }).click();
    assert.equal((await page.getByTestId("score-us").innerText()).trim(), "1");
    assert.equal((await page.getByTestId("score-them").innerText()).trim(), "0");
    await page.getByRole("button", { name: "Team 91 2033", exact: true }).click();
    await page.getByRole("button", { name: "Live", exact: true }).click();
    assert.equal((await page.getByTestId("score-us").innerText()).trim(), "5");
    assert.equal((await page.getByTestId("score-them").innerText()).trim(), "4");

    const manifestHref = await page.locator('link[rel="manifest"]').getAttribute("href");
    assert.equal(manifestHref, "manifest.json");
    const manifest = await page.evaluate(async (href) => {
      const response = await fetch(href);
      return { ok: response.ok, type: response.headers.get("content-type"), body: await response.json() };
    }, manifestHref);
    assert.equal(manifest.ok, true);
    assert.match(manifest.type || "", /json/);
    assert.equal(manifest.body.start_url, "./index.html");
    assert.equal(manifest.body.scope, "./");
    assert.ok(manifest.body.icons.every((icon) => icon.src.startsWith("./")));
    const rooted = await page.evaluate(() => [...document.querySelectorAll("link[href], script[src]")].map((node) => node.getAttribute("href") || node.getAttribute("src")).filter((value) => value && value.startsWith("/")));
    assert.deepEqual(rooted, []);

    await page.getByRole("button", { name: "Switch to dark mode", exact: true }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    await page.reload();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), "dark");
    await page.getByRole("button", { name: "Switch to light mode", exact: true }).click();

    assert.deepEqual(pageErrors, []);
    assert.deepEqual(badResponses, []);

    await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return ready.scope;
    });
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.getByRole("button", { name: "Roster", exact: true }).waitFor();
    await page.getByRole("button", { name: "Live", exact: true }).click();
    assert.equal((await page.getByTestId("score-us").innerText()).trim(), "5");
    await context.setOffline(false);

    await mkdir(ARTIFACTS, { recursive: true });
    for (const name of ["roster_screen.png", "live_entry_screen.png", "box_score_screen.png", "season_stats_screen.png"]) {
      await copyFile(join(SHOTS, name), join(ARTIFACTS, name));
    }
    console.log("GAME TEST PASSED");
  } catch (error) {
    await page.screenshot({ path: "/tmp/lax-fail.png", fullPage: true }).catch(() => {});
    console.error("PAGE ERRORS", pageErrors);
    console.error("BAD RESPONSES", badResponses);
    throw error;
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
