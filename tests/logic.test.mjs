import assert from "node:assert/strict";
import test from "node:test";
import {
  addEvent,
  applyEvent,
  boxScore,
  chipLabel,
  createGame,
  defaultData,
  deleteEvent,
  derive,
  duplicateGroups,
  emptyLine,
  exportPayload,
  formatPct,
  gameCsv,
  loadData,
  normalizeData,
  parseBackup,
  playerName,
  saveData,
  seasonCsv,
  seasonForTeam,
  scoreGame,
  sortPlayers,
  undoLast,
  updateEvent,
} from "../js/logic.js";

function memoryStorage(initial) {
  const map = new Map(initial ? Object.entries(initial) : []);
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key),
  };
}

function fresh() {
  return defaultData();
}

test("seed roster names, blanks, and the shared number", () => {
  const data = fresh();
  const team = data.teams.find((item) => item.id === "team91");
  const brick = data.teams.find((item) => item.id === "brick56");
  assert.equal(team.players.length, 25);
  assert.equal(brick.players.length, 0);
  assert.equal(brick.name, "Brick 5/6");
  assert.equal(playerName(team.players.find((p) => p.id === "p_ecke")), "Ecke");
  assert.equal(playerName(team.players.find((p) => p.id === "p_luke")), "Luke");
  assert.equal(playerName(team.players.find((p) => p.id === "p_cruz")), "Jose (Manny) Cruz");
  assert.equal(playerName(team.players.find((p) => p.id === "p_bradly")), "Bradly");
  const blanks = team.players.filter((p) => !p.number).map(playerName).sort();
  assert.deepEqual(blanks, ["Bill", "Bradly", "James Brunner", "Lucas"]);
  assert.equal(team.players.find((p) => p.id === "p_carter").number, "43");
  assert.equal(team.players.find((p) => p.id === "p_donlan").number, "33");
  assert.deepEqual(duplicateGroups(team.players), []);
  const sorted = sortPlayers(team.players).map(playerName);
  assert.equal(sorted[0], "Ecke");
  assert.deepEqual(sorted.slice(-4), ["Bill", "Bradly", "James Brunner", "Lucas"]);
  assert.equal(chipLabel(team.players.find((p) => p.id === "p_carter"), team.players), "Carter G.");
  assert.equal(chipLabel(team.players.find((p) => p.id === "p_keegan"), team.players), "Keegan G.");
  assert.equal(chipLabel(team.players.find((p) => p.id === "p_ecke"), team.players), "Ecke");
  assert.equal(chipLabel(team.players.find((p) => p.id === "p_raichle"), team.players), "Raichle");
});

test("goals count as shots and shots on goal; misses and saves do not move the score", () => {
  const data = fresh();
  const team = data.teams[0];
  const { game } = createGame(data, team.id, { opponent: "Summit", date: "2026-04-18", homeAway: "home", location: "Turf" });
  const byId = (id) => team.players.find((p) => p.id === id);
  addEvent(game, { type: "goal", player: byId("p_raichle"), quarter: "Q1" });
  addEvent(game, { type: "shot", player: byId("p_lopes"), quarter: "Q1" });
  addEvent(game, { type: "sog", player: byId("p_carter"), quarter: "Q1" });
  addEvent(game, { type: "ga", player: byId("p_brunner"), quarter: "Q2" });
  addEvent(game, { type: "opp_goal", quarter: "Q2" });
  addEvent(game, { type: "save", player: byId("p_bill"), quarter: "Q2" });
  addEvent(game, { type: "pim", player: byId("p_tricarico"), quarter: "Q2", minutes: 0.5 });
  addEvent(game, { type: "pim", player: byId("p_tricarico"), quarter: "Q3", minutes: 1.5 });
  addEvent(game, { type: "gb", player: byId("p_lukas"), quarter: "Q4" });

  const box = boxScore(game, team);
  const row = (name) => box.players.find((p) => p.name === name);
  assert.equal(row("Christopher Raichle").g, 1);
  assert.equal(row("Christopher Raichle").sh, 1);
  assert.equal(row("Christopher Raichle").sog, 1);
  assert.equal(row("Jake Lopes").sh, 1);
  assert.equal(row("Jake Lopes").sog, 0);
  assert.equal(row("Carter Glowacki").sh, 1);
  assert.equal(row("Carter Glowacki").sog, 1);
  assert.equal(row("Carter Glowacki").g, 0);
  assert.equal(row("Lucas").gb, 1);
  assert.equal(row("Lucas").number, "");
  assert.equal(row("Carter Glowacki").number, "43");
  assert.equal(row("Michael Tricarico").pim, 2);
  assert.equal(box.totals.g, 1);
  assert.equal(box.totals.sh, 3);
  assert.equal(box.totals.sog, 2);
  assert.equal(formatPct(box.totals.shPct), "33.3%");
  assert.equal(box.score.total.us, 1);
  assert.equal(box.score.total.them, 1);
  assert.equal(box.score.byQ.Q1.us, 1);
  assert.equal(box.score.byQ.Q2.them, 1);
  assert.equal(row("James Brunner").ga, 1);
  assert.equal(row("Bill").sv, 1);
  assert.equal(formatPct(derive(row("Bill")).svPct), "100%");
  assert.equal(formatPct(emptyLine().shPct), "—");
});

test("deleting a goal removes its assist; undo removes only the last event", () => {
  const data = fresh();
  const team = data.teams[0];
  const { game } = createGame(data, team.id, { opponent: "Ridge", date: "2026-05-01", homeAway: "away", location: "" });
  const scorer = team.players.find((p) => p.id === "p_donlan");
  const assist = team.players.find((p) => p.id === "p_luke");
  const goal = addEvent(game, { type: "goal", player: scorer, quarter: "Q2" });
  addEvent(game, { type: "assist", player: assist, quarter: "Q2", goalEventId: goal.id });
  addEvent(game, { type: "opp_goal", quarter: "Q2" });
  const undone = undoLast(game);
  assert.equal(undone.type, "opp_goal");
  assert.equal(scoreGame(game.events).total.them, 0);
  assert.equal(deleteEvent(game, goal.id), true);
  assert.equal(game.events.length, 0);
});

test("editing a goal into a shot drops the linked assist and keeps the shot", () => {
  const data = fresh();
  const team = data.teams[0];
  const { game } = createGame(data, team.id, { opponent: "Ridge", date: "2026-05-01", homeAway: "home", location: "" });
  const scorer = team.players.find((p) => p.id === "p_fittante");
  const helper = team.players.find((p) => p.id === "p_luke");
  const goal = addEvent(game, { type: "goal", player: scorer, quarter: "Q4" });
  addEvent(game, { type: "assist", player: helper, quarter: "Q4", goalEventId: goal.id });
  updateEvent(game, team, goal.id, { type: "shot", playerId: scorer.id, quarter: "Q4" });
  const box = boxScore(game, team);
  const teddy = box.players.find((p) => p.name === "Teddy Fittante");
  const luke = box.players.find((p) => p.name === "Luke");
  assert.equal(teddy.g, 0);
  assert.equal(teddy.sh, 1);
  assert.equal(teddy.sog, 0);
  assert.equal(luke.a, 0);
});

test("season record, per-game averages, and leaders use the right denominators", () => {
  const data = fresh();
  const team = data.teams[0];
  const scorer = team.players.find((p) => p.id === "p_raichle");
  const { game: first } = createGame(data, team.id, { opponent: "A", date: "2026-04-01", homeAway: "home", location: "" });
  addEvent(first, { type: "goal", player: scorer, quarter: "Q1" });
  addEvent(first, { type: "goal", player: scorer, quarter: "Q1" });
  const { game: second } = createGame(data, team.id, { opponent: "B", date: "2026-04-08", homeAway: "away", location: "" });
  addEvent(second, { type: "opp_goal", quarter: "Q1" });
  addEvent(second, { type: "opp_goal", quarter: "Q2" });
  const season = seasonForTeam(data, team);
  assert.equal(season.gamesPlayed, 2);
  assert.deepEqual(season.record, { w: 1, l: 1, t: 0 });
  assert.equal(season.goalsFor, 2);
  assert.equal(season.goalsAgainst, 2);
  const chris = season.players.find((p) => p.name === "Christopher Raichle");
  assert.equal(chris.gp, 1);
  assert.equal(chris.g, 2);
  assert.equal(season.totals.g, 2);
  const csv = seasonCsv(team, season);
  assert.match(csv, /Christopher Raichle/);
  assert.match(csv, /Per game averages/);
  assert.match(csv, /1-1-0/);
  const gameExport = gameCsv(team, first, boxScore(first, team));
  assert.match(gameExport, /Summit|Opponent,A/);
  assert.match(gameExport, /Christopher Raichle/);
});

test("backup round-trip keeps games and refuses junk", () => {
  const data = fresh();
  createGame(data, "brick56", { opponent: "Ocean", date: "2026-06-01", homeAway: "away", location: "Beach" });
  const storage = memoryStorage();
  saveData(storage, data);
  const loaded = loadData(storage);
  assert.equal(loaded.ok, true);
  assert.equal(loaded.data.games[0].opponent, "Ocean");
  assert.equal(loaded.data.teams.find((team) => team.id === "brick56").players.length, 0);
  const wrapped = JSON.stringify(exportPayload(loaded.data, new Date("2026-04-18T15:00:00Z")));
  const parsed = parseBackup(wrapped);
  assert.equal(parsed.data.games[0].location, "Beach");
  assert.equal(parsed.exportedAt, "2026-04-18T15:00:00.000Z");
  assert.equal(parseBackup("{").error.includes("JSON"), true);
  assert.equal(Boolean(parseBackup('{"nope":true}').error), true);
  assert.equal(normalizeData({ teams: [], games: [] }), null);
});

test("an old saved roster is corrected without dropping games", () => {
  const raw = defaultData();
  const team = raw.teams.find((item) => item.id === "team91");
  team.players.find((player) => player.id === "p_lukas").firstName = "Lukas";
  team.players.find((player) => player.id === "p_lukas").number = "12";
  team.players.find((player) => player.id === "p_carter").number = "33";
  const { game } = createGame(raw, "team91", { opponent: "Summit", date: "2026-04-18", homeAway: "home", location: "Turf" });
  addEvent(game, { type: "gb", player: team.players.find((player) => player.id === "p_lukas"), quarter: "Q1" });
  const loaded = normalizeData(JSON.parse(JSON.stringify(raw)));
  const next = loaded.teams.find((item) => item.id === "team91");
  const lucas = next.players.find((player) => player.id === "p_lukas");
  assert.equal(playerName(lucas), "Lucas");
  assert.equal(lucas.number, "12");
  assert.equal(next.players.find((player) => player.id === "p_carter").number, "43");
  assert.equal(next.players.find((player) => player.id === "p_donlan").number, "33");
  assert.equal(loaded.games.length, 1);
  assert.equal(loaded.games[0].opponent, "Summit");
  assert.equal(loaded.games[0].events.length, 1);
  assert.equal(loaded.games[0].events[0].type, "gb");

  const custom = defaultData();
  const customTeam = custom.teams.find((item) => item.id === "team91");
  customTeam.players.find((player) => player.id === "p_carter").number = "44";
  customTeam.players.find((player) => player.id === "p_lukas").firstName = "Luc";
  const kept = normalizeData(custom);
  const keptTeam = kept.teams.find((item) => item.id === "team91");
  assert.equal(keptTeam.players.find((player) => player.id === "p_carter").number, "44");
  assert.equal(keptTeam.players.find((player) => player.id === "p_lukas").firstName, "Luc");
});

test("shot chart math is stable for an empty line and a caused turnover", () => {
  const line = emptyLine();
  applyEvent(line, { type: "ct" });
  applyEvent(line, { type: "fow" });
  applyEvent(line, { type: "fol" });
  const stats = derive(line);
  assert.equal(stats.ct, 1);
  assert.equal(stats.foPct, 0.5);
  assert.equal(stats.shPct, null);
  assert.equal(addEvent({ events: [], quarter: "Q1" }, { type: "pim", minutes: 0 }), null);
});
