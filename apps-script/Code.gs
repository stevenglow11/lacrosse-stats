/**
 * Bound to the lacrosse results Google Sheet.
 * Extensions > Apps Script from that sheet. Do not create a standalone script.
 *
 * Script property PASSCODE (Project Settings > Script properties) is required.
 * Never put the passcode in this file or in GitHub.
 *
 * Web app: Execute as Me, Who has access: Anyone.
 * POST body is JSON text (the phone sends Content-Type text/plain).
 * GET returns the public results document. ?callback=name wraps it for JSONP.
 */

var DEFAULT_TEAMS = [
  { id: "team91", name: "Team 91 2033" },
  { id: "brick56", name: "Brick 5/6" }
];

var HEADERS = ["id", "teamId", "date", "updatedAt", "hidden", "json"];
var MAX_JSON = 100000;

function doGet(e) {
  try {
    return output_(buildResults_(), e);
  } catch (err) {
    return output_({ ok: false, error: String(err && err.message ? err.message : err) }, e);
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
  } catch (err) {
    return output_({ ok: false, error: "The sheet is busy. Try Submit again in a moment." }, e);
  }
  try {
    var body = readBody_(e);
    return output_(handlePost_(body), e);
  } catch (err) {
    return output_({ ok: false, error: String(err && err.message ? err.message : err) }, e);
  } finally {
    lock.releaseLock();
  }
}

function output_(obj, e) {
  var text = JSON.stringify(obj);
  var callback = e && e.parameter ? String(e.parameter.callback || "") : "";
  if (callback && /^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(callback)) {
    return ContentService.createTextOutput(callback + "(" + text + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function readBody_(e) {
  var text = "";
  if (e && e.postData && e.postData.contents) text = e.postData.contents;
  else if (e && e.parameter && e.parameter.payload) text = e.parameter.payload;
  text = String(text || "").replace(/^\uFEFF/, "").trim();
  if (!text) return {};
  try {
    var parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (err) {
    return {};
  }
}

function handlePost_(body) {
  var gate = checkPasscode_(body && body.passcode);
  if (!gate.ok) return gate;

  if (body.action === "visibility" || (body.id && !body.game && !body.teams && typeof body.hidden === "boolean")) {
    var changed = setHidden_(String(body.id || ""), body.hidden === true);
    if (!changed && body.hidden !== true) return { ok: false, error: "That game is not on the public page yet. Tap Submit results." };
    return { ok: true };
  }

  if (body.game && body.game.id) {
    upsertGame_(body.game, body.teamId, body.teamName, body.hidden === true);
    return { ok: true };
  }

  if (Array.isArray(body.teams)) {
    body.teams.forEach(function (team) {
      (team.games || []).forEach(function (game) {
        upsertGame_(game, team.id, team.name, false);
      });
    });
    (body.hiddenIds || []).forEach(function (id) {
      setHidden_(String(id || ""), true);
    });
    return { ok: true };
  }

  if (body.id && (body.opponent || body.players)) {
    upsertGame_(body, body.teamId, body.teamName, body.hidden === true);
    return { ok: true };
  }

  return { ok: false, error: "Nothing to save." };
}

function checkPasscode_(given) {
  var expected = PropertiesService.getScriptProperties().getProperty("PASSCODE");
  if (!expected) return { ok: false, error: "Passcode is not set up on the sheet yet." };
  var actual = String(given || "");
  var want = String(expected);
  if (actual.length !== want.length) return { ok: false, error: "Wrong passcode." };
  var mismatch = 0;
  for (var i = 0; i < want.length; i++) mismatch |= actual.charCodeAt(i) ^ want.charCodeAt(i);
  if (mismatch !== 0) return { ok: false, error: "Wrong passcode." };
  return { ok: true };
}

function sheet_() {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    ss = null;
  }
  if (!ss) throw new Error("Open this script from the Google Sheet, using Extensions > Apps Script.");
  var sh = ss.getSheetByName("Games");
  if (!sh) {
    sh = ss.insertSheet("Games");
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
  }
  return sh;
}

function readRows_() {
  var ss;
  try {
    ss = SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    return [];
  }
  if (!ss) return [];
  var sh = ss.getSheetByName("Games");
  if (!sh) return [];
  var values = sh.getDataRange().getValues();
  if (!values || values.length < 2) return [];
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    if (!values[i][0]) continue;
    rows.push({
      rowNumber: i + 1,
      id: String(values[i][0]),
      teamId: String(values[i][1] || ""),
      date: String(values[i][2] || ""),
      updatedAt: stamp_(values[i][3]),
      hidden: values[i][4] === true || String(values[i][4]).toLowerCase() === "true",
      json: String(values[i][5] || "")
    });
  }
  return rows;
}

function stamp_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) return value.toISOString();
  return String(value || "");
}

function upsertGame_(game, teamId, teamName, hidden) {
  if (!game || !game.id) throw new Error("Game is missing an id.");
  var clean = publicGame_(game, teamId, teamName);
  var json = JSON.stringify(clean);
  if (json.length > MAX_JSON) throw new Error("That game is too large to publish.");
  var sh = sheet_();
  var rows = readRows_();
  var rowNumber = 0;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === clean.id) rowNumber = rows[i].rowNumber;
  }
  var row = [clean.id, clean.teamId, clean.date, new Date().toISOString(), hidden === true, json];
  if (!rowNumber) sh.appendRow(row);
  else sh.getRange(rowNumber, 1, 1, 6).setValues([row]);
}

function setHidden_(id, hidden) {
  if (!id) return false;
  var rows = readRows_();
  var found = null;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].id === id) found = rows[i];
  }
  if (!found) return false;
  var sh = sheet_();
  sh.getRange(found.rowNumber, 5, 1, 1).setValues([[hidden === true]]);
  return true;
}

function publicGame_(game, teamId, teamName) {
  return {
    id: String(game.id).slice(0, 80),
    date: String(game.date || ""),
    dateLabel: String(game.dateLabel || game.date || ""),
    opponent: String(game.opponent || "Opponent").slice(0, 80),
    homeAway: game.homeAway === "away" ? "away" : "home",
    location: String(game.location || "").slice(0, 80),
    result: game.result === "W" || game.result === "L" || game.result === "T" ? game.result : resultLetter_(game.us, game.them),
    us: Number(game.us) || 0,
    them: Number(game.them) || 0,
    quarters: game.quarters || [],
    players: game.players || [],
    totals: game.totals || {},
    teamId: String(teamId || game.teamId || ""),
    teamName: String(teamName || game.teamName || "")
  };
}

function buildResults_() {
  var rows = readRows_();
  var byTeam = {};
  DEFAULT_TEAMS.forEach(function (team) {
    byTeam[team.id] = { id: team.id, name: team.name, games: [] };
  });
  var newest = "";
  rows.forEach(function (row) {
    if (row.hidden) return;
    var game = {};
    try {
      game = JSON.parse(row.json);
    } catch (err) {
      return;
    }
    if (!game || !game.id) return;
    var teamId = String(game.teamId || row.teamId || "");
    if (!teamId) return;
    if (!byTeam[teamId]) {
      byTeam[teamId] = { id: teamId, name: game.teamName || teamId, games: [] };
    } else if (game.teamName) {
      byTeam[teamId].name = game.teamName;
    }
    delete game.teamId;
    delete game.teamName;
    delete game.passcode;
    byTeam[teamId].games.push(game);
    if (row.updatedAt > newest) newest = row.updatedAt;
  });

  var teams = Object.keys(byTeam).map(function (id) {
    var team = byTeam[id];
    team.games.sort(function (a, b) {
      return String(b.date || "").localeCompare(String(a.date || ""));
    });
    var record = { w: 0, l: 0, t: 0 };
    var goalsFor = 0;
    var goalsAgainst = 0;
    team.games.forEach(function (game) {
      var letter = resultLetter_(game.us, game.them);
      game.result = letter;
      if (letter === "W") record.w++;
      else if (letter === "L") record.l++;
      else record.t++;
      goalsFor += Number(game.us) || 0;
      goalsAgainst += Number(game.them) || 0;
    });
    return {
      id: team.id,
      name: team.name,
      record: record,
      recordLabel: record.w + "-" + record.l + "-" + record.t,
      goalsFor: goalsFor,
      goalsAgainst: goalsAgainst,
      games: team.games,
      leaders: leadersFor_(team.games)
    };
  });

  teams.sort(function (a, b) {
    var order = { team91: 0, brick56: 1 };
    var ao = order[a.id] == null ? 9 : order[a.id];
    var bo = order[b.id] == null ? 9 : order[b.id];
    if (ao !== bo) return ao - bo;
    return a.name.localeCompare(b.name);
  });

  return { version: 1, updatedAt: newest || null, teams: teams };
}

function resultLetter_(us, them) {
  var left = Number(us) || 0;
  var right = Number(them) || 0;
  if (left > right) return "W";
  if (left < right) return "L";
  return "T";
}

function num_(value) {
  if (typeof value === "number" && isFinite(value)) return value;
  var text = String(value == null ? "" : value).replace("%", "").trim();
  if (!text || text === "—" || text === "-") return 0;
  var parsed = Number(text);
  return isFinite(parsed) ? parsed : 0;
}

function stat_(player, key) {
  if (!player) return 0;
  if (player.stats && player.stats[key] != null) return num_(player.stats[key]);
  if (player[key] != null) return num_(player[key]);
  return 0;
}

function formatCount_(n) {
  var rounded = Math.round(Number(n) * 10) / 10;
  if (!isFinite(rounded)) return "0";
  return rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
}

function formatPct_(ratio) {
  if (ratio == null || !isFinite(ratio)) return "—";
  var rounded = Math.round(ratio * 1000) / 10;
  var text = rounded % 1 === 0 ? String(rounded) : rounded.toFixed(1);
  return text + "%";
}

function leadersFor_(games) {
  var map = {};
  (games || []).forEach(function (game) {
    (game.players || []).forEach(function (player) {
      var name = String(player.name || "Player");
      var number = String(player.number || "");
      var key = number + "|" + name;
      if (!map[key]) {
        map[key] = { name: name, number: number, g: 0, a: 0, sh: 0, sog: 0, gb: 0, ct: 0, to: 0, fow: 0, fol: 0, sv: 0, ga: 0, pim: 0 };
      }
      ["g", "a", "sh", "sog", "gb", "ct", "to", "fow", "fol", "sv", "ga", "pim"].forEach(function (stat) {
        map[key][stat] += stat_(player, stat);
      });
    });
  });
  var players = Object.keys(map).map(function (key) {
    var player = map[key];
    player.pts = player.g + player.a;
    return player;
  });
  var cats = [
    { label: "Goals", sort: function (p) { return p.g; }, min: function (p) { return p.g > 0; }, value: function (p) { return formatCount_(p.g); } },
    { label: "Assists", sort: function (p) { return p.a; }, min: function (p) { return p.a > 0; }, value: function (p) { return formatCount_(p.a); } },
    { label: "Points", sort: function (p) { return p.pts; }, min: function (p) { return p.pts > 0; }, value: function (p) { return formatCount_(p.pts); } },
    { label: "Shots", sort: function (p) { return p.sh; }, min: function (p) { return p.sh > 0; }, value: function (p) { return formatCount_(p.sh); } },
    { label: "Shots on goal", sort: function (p) { return p.sog; }, min: function (p) { return p.sog > 0; }, value: function (p) { return formatCount_(p.sog); } },
    { label: "Shooting %", sort: function (p) { return p.sh ? p.g / p.sh : 0; }, min: function (p) { return p.sh >= 1; }, value: function (p) { return formatPct_(p.g / p.sh) + " · " + formatCount_(p.g) + "/" + formatCount_(p.sh); } },
    { label: "Ground balls", sort: function (p) { return p.gb; }, min: function (p) { return p.gb > 0; }, value: function (p) { return formatCount_(p.gb); } },
    { label: "Caused turnovers", sort: function (p) { return p.ct; }, min: function (p) { return p.ct > 0; }, value: function (p) { return formatCount_(p.ct); } },
    { label: "Faceoff %", sort: function (p) { return (p.fow + p.fol) ? p.fow / (p.fow + p.fol) : 0; }, min: function (p) { return p.fow + p.fol >= 1; }, value: function (p) { return formatPct_(p.fow / (p.fow + p.fol)) + " · " + formatCount_(p.fow) + "/" + formatCount_(p.fow + p.fol); } },
    { label: "Saves", sort: function (p) { return p.sv; }, min: function (p) { return p.sv > 0; }, value: function (p) { return formatCount_(p.sv); } },
    { label: "Save %", sort: function (p) { return (p.sv + p.ga) ? p.sv / (p.sv + p.ga) : 0; }, min: function (p) { return p.sv + p.ga >= 1; }, value: function (p) { return formatPct_(p.sv / (p.sv + p.ga)) + " · " + formatCount_(p.sv) + "/" + formatCount_(p.sv + p.ga); } },
    { label: "Penalty minutes", sort: function (p) { return p.pim; }, min: function (p) { return p.pim > 0; }, value: function (p) { return formatCount_(p.pim); } }
  ];
  return cats.map(function (cat) {
    var ranked = players.filter(cat.min).sort(function (a, b) {
      return cat.sort(b) - cat.sort(a) || a.name.localeCompare(b.name);
    }).slice(0, 5);
    var last = null;
    var lastRank = 0;
    return {
      label: cat.label,
      rows: ranked.map(function (player, index) {
        var score = cat.sort(player);
        var rank = last != null && Math.abs(score - last) < 1e-9 ? lastRank : index + 1;
        last = score;
        lastRank = rank;
        return { rank: rank, name: player.name, number: player.number, value: cat.value(player) };
      })
    };
  }).filter(function (cat) { return cat.rows.length; });
}
