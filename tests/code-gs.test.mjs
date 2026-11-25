import assert from "node:assert/strict";
import test from "node:test";
import { createGasApp } from "./gas-harness.mjs";

const PASS = "sheet-test-pass";

function game(id, opponent, us, them) {
  return {
    id,
    date: "2026-04-18",
    dateLabel: "Sat, Apr 18, 2026",
    opponent,
    homeAway: "home",
    location: "Ridge Turf",
    result: us > them ? "W" : us < them ? "L" : "T",
    us,
    them,
    quarters: [{ label: "Q1", us, them }],
    players: [{ name: "Christopher Raichle", number: "2", stats: { g: String(us), a: "0", sh: String(us), sog: String(us) } }],
    totals: { g: String(us) },
  };
}

test("the sheet script rejects a missing or wrong passcode and stores none", () => {
  const gas = createGasApp(PASS);
  assert.equal(gas.post({ game: game("g1", "Summit", 1, 0), teamId: "team91", teamName: "Team 91 2033" }).error, "Wrong passcode.");
  const unset = createGasApp(null);
  unset.rows;
  const propsGone = createGasApp("");
  assert.match(propsGone.post({ passcode: "", game: game("g1", "Summit", 1, 0) }).error, /not set up/);
  assert.equal(gas.rows().length, 0);
});

test("upsert, hide, unhide, and full results rebuild the public document", () => {
  const gas = createGasApp(PASS);
  const saved = gas.post({
    passcode: PASS,
    teamId: "team91",
    teamName: "Team 91 2033",
    hidden: false,
    game: game("g1", "Summit", 2, 1),
  });
  assert.equal(saved.ok, true);
  assert.equal(JSON.stringify(gas.rows()).includes(PASS), false);

  let doc = JSON.parse(gas.get().text);
  assert.equal(doc.teams.find((team) => team.id === "team91").recordLabel, "1-0-0");
  assert.equal(doc.teams.find((team) => team.id === "team91").games[0].opponent, "Summit");
  assert.equal(doc.teams.find((team) => team.id === "brick56").games.length, 0);
  assert.equal(doc.teams[0].leaders.some((board) => board.label === "Goals"), true);

  const again = gas.post({
    passcode: PASS,
    teamId: "team91",
    teamName: "Team 91 2033",
    game: game("g1", "Summit", 3, 1),
  });
  assert.equal(again.ok, true);
  assert.equal(gas.rows().length, 2);
  doc = JSON.parse(gas.get().text);
  assert.equal(doc.teams.find((team) => team.id === "team91").games[0].us, 3);

  assert.equal(gas.post({ passcode: PASS, action: "visibility", id: "g1", hidden: true }).ok, true);
  doc = JSON.parse(gas.get().text);
  assert.equal(doc.teams.find((team) => team.id === "team91").games.length, 0);

  assert.equal(gas.post({ passcode: PASS, id: "g1", hidden: false }).ok, true);
  doc = JSON.parse(gas.get().text);
  assert.equal(doc.teams.find((team) => team.id === "team91").games.length, 1);

  const full = gas.post({
    passcode: PASS,
    teams: [
      { id: "brick56", name: "Brick 5/6", games: [game("g2", "Ocean", 1, 0)] },
    ],
    hiddenIds: ["g1"],
  });
  assert.equal(full.ok, true);
  doc = JSON.parse(gas.get().text);
  assert.equal(doc.teams.find((team) => team.id === "team91").games.length, 0);
  assert.equal(doc.teams.find((team) => team.id === "brick56").games[0].opponent, "Ocean");
  assert.equal(doc.teams.find((team) => team.id === "brick56").recordLabel, "1-0-0");

  const jsonp = gas.get({ callback: "laxResults_1" });
  assert.equal(jsonp.mime, "application/javascript");
  assert.match(jsonp.text, /^laxResults_1\(/);
  assert.equal(gas.get({ callback: "alert(1)" }).mime, "application/json");
});
