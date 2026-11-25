import assert from "node:assert/strict";
import test from "node:test";
import { addEvent, createGame, defaultData } from "../js/logic.js";
import { RESULTS_CONFIG } from "../js/results-config.js";
import { buildPublicResults, publishResults, publishingMode } from "../js/publisher.js";

function privateKeys(value, found = []) {
  if (!value || typeof value !== "object") return found;
  for (const key of Object.keys(value)) {
    if (["events", "playerId", "goalEventId", "token", "secret", "authorization", "password"].includes(key)) found.push(key);
    privateKeys(value[key], found);
  }
  return found;
}

function sample() {
  const data = defaultData();
  const team = data.teams[0];
  const brick = data.teams[1];
  const scorer = team.players.find((player) => player.id === "p_raichle");
  const { game } = createGame(data, team.id, { opponent: "Summit", date: "2026-04-18", homeAway: "home", location: "Ridge Turf" });
  addEvent(game, { type: "goal", player: scorer, quarter: "Q1" });
  addEvent(game, { type: "opp_goal", quarter: "Q2" });
  const { game: hidden } = createGame(data, team.id, { opponent: "Secret Scrimmage", date: "2026-04-19", homeAway: "away", location: "" });
  addEvent(hidden, { type: "goal", player: scorer, quarter: "Q1" });
  const { game: brickGame } = createGame(data, brick.id, { opponent: "Ocean", date: "2026-05-02", homeAway: "away", location: "" });
  brickGame.final = true;
  addEvent(brickGame, { type: "goal", player: { id: "p_new", firstName: "Alex", lastName: "Rivera", number: "8" }, quarter: "Q1" });
  game.final = true;
  return { data, game };
}

test("public results include only final games and no private fields", () => {
  const { data, game } = sample();
  const payload = buildPublicResults(data, new Date("2026-04-18T18:00:00Z"));
  assert.equal(payload.version, 1);
  assert.deepEqual(privateKeys(payload), []);
  const team = payload.teams.find((item) => item.id === "team91");
  const brick = payload.teams.find((item) => item.id === "brick56");
  assert.equal(team.games.length, 1);
  assert.equal(team.games[0].opponent, "Summit");
  assert.equal(team.games[0].id, game.id);
  assert.equal(team.games[0].result, "T");
  assert.equal(team.games[0].us, 1);
  assert.equal(team.games[0].them, 1);
  assert.equal(team.recordLabel, "0-0-1");
  assert.equal(team.games[0].players.some((player) => player.name === "Christopher Raichle"), true);
  assert.equal(JSON.stringify(team).includes("Secret Scrimmage"), false);
  assert.equal(brick.games.length, 1);
  assert.equal(brick.games[0].opponent, "Ocean");
  assert.equal(brick.games[0].result, "W");
  assert.equal(brick.recordLabel, "1-0-0");
});

test("file publisher still works and the endpoint hook posts without a secret", async () => {
  const previous = RESULTS_CONFIG.submitUrl;
  try {
  RESULTS_CONFIG.submitUrl = "";
  assert.equal(publishingMode(), "file");
  const { data } = sample();
  let downloaded = "";
  const fileResult = await publishResults(data, {
    downloadImpl: (_name, text) => { downloaded = text; },
  });
  assert.equal(fileResult.mode, "file");
  assert.match(downloaded, /Summit/);
  assert.equal(downloaded.includes("Secret Scrimmage"), false);

  RESULTS_CONFIG.submitUrl = "https://example.com/lacrosse-results";
  try {
    assert.equal(publishingMode(), "endpoint");
    let seen = null;
    const endpointResult = await publishResults(data, {
      passcode: "test-only",
      fetchImpl: async (url, options) => {
        seen = { url, options };
        return { ok: true, json: async () => ({ ok: true }) };
      },
    });
    assert.equal(endpointResult.mode, "endpoint");
    assert.equal(seen.url, "https://example.com/lacrosse-results");
    assert.equal(seen.options.method, "POST");
    assert.match(seen.options.headers["Content-Type"], /text\/plain/);
    assert.equal(seen.options.headers.Authorization, undefined);
    assert.equal(seen.options.headers["X-Api-Key"], undefined);
    const posted = JSON.parse(seen.options.body);
    assert.equal(posted.passcode, "test-only");
    assert.match(JSON.stringify(posted.teams), /Summit/);
  } finally {
    RESULTS_CONFIG.submitUrl = previous;
  }

  RESULTS_CONFIG.submitUrl = "javascript:alert(1)";
  assert.equal(publishingMode(), "file");
  } finally {
    RESULTS_CONFIG.submitUrl = previous;
  }
});
