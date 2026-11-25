# Lacrosse Stats

A phone-first stat tracker for youth boys' lacrosse. Steve can keep live stats for **Team 91 2033** (the NJ 2033 team) and **Brick 5/6** during a game, then look up the box score and season totals later.

Stats stay on the phone. There is no account and no server. The app also works if the field has bad service, after it has been opened once online.

Live site (after GitHub Pages is turned on):

**https://stevenglow11.github.io/lacrosse-stats/**

Public results (anyone can open this, no login):

**https://stevenglow11.github.io/lacrosse-stats/results.html**

## Turn on GitHub Pages

1. Open this repo on GitHub.
2. Go to **Settings**.
3. Open **Pages** in the left sidebar.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**.
5. Set the branch to **main** and the folder to **/ (root)**.
6. Save.

GitHub may take a minute or two. Then open https://stevenglow11.github.io/lacrosse-stats/

The website itself is public. Stats you enter stay on the phone until you tap **Submit results** and upload the file (see Publishing results below). The built-in Team 91 roster is part of the app, so those names are in the project. Brick 5/6 starts with an empty roster. The public page starts with no games.

## Add it to the iPhone home screen

1. Open the link in **Safari** (the Add to Home Screen option is in Safari, not every other browser).
2. Tap the **Share** button.
3. Tap **Add to Home Screen**, then **Add**.
4. Open **Lax Stats** from the new icon.
5. Leave it open once while you have service. After that it can work offline.

On Android, open the site in Chrome, tap the menu, and choose **Install app** or **Add to Home screen**.

Use that home-screen icon each time. A home-screen app and a Safari tab can keep separate copies of the stats.

## What's already filled in

Team 91 2033 has the current roster, including players who don't have a number yet (Lukas, Bradly, Bill, and James Brunner). They can still be tapped during a game. Ecke is listed by last name only, and Luke is listed by first name only. Carter Glowacki and Jack Donlan both have **#33** until you change one. The roster screen warns you, and you can still save.

Brick 5/6 has no players yet. Add them on the Roster tab. The app does not invent sample players.

## Enter a game

1. Tap the team name at the top. Each team has its own roster and its own games.
2. On **Roster**, add or fix players: first name, last name, jersey (optional), and position (optional). Duplicate numbers are allowed.
3. On **Games**, tap **New game**. Enter the opponent, date, home or away, and a field if you want.
4. You land on **Live**. The big number on the left is Us. The big number on the right is Them.
5. Tap the quarter (Q1–Q4 or OT) when the period changes.
6. Tap a player, then tap the stat. Or tap the stat first, then the player.
7. **Goal** also counts as a shot and a shot on goal. You do not tap those separately for a goal.
8. **Shot** is a miss. **SOG** is a shot on goal that was not a goal (it still counts as a shot).
9. After a goal, pick who assisted, or tap **Skip assist**.
10. **Opp** adds one to their score. **GA** is only the goalie's goals-against stat and does not change the score.
11. **Penalty** asks for minutes. 0:30, 1:00, 1:30, 2:00, and 3:00 are one tap.
12. Every tap is saved immediately. You can refresh the page and the game is still there.
13. **Undo** removes the last thing you entered.
14. **Recent** lists the latest events. **Edit** or **Delete** fixes a mistake. **All** opens the full list when there are more than two.
15. **Box** shows the box score: each player, team totals, and the score by quarter.
16. **Stats** shows season totals, per-game averages, stat leaders, and a game log for one player.

Shooting percentage is goals divided by shots. Faceoff percentage is wins divided by faceoffs taken. Save percentage is saves divided by saves plus goals against.

## Publishing results

Anyone can open the results page and see finished games, the season record, and leaders:

https://stevenglow11.github.io/lacrosse-stats/results.html

Nothing is sent there until you tap **Submit results**. The public page shows names, numbers, and stats. It does not get the private backup.

### One tap, after the Google Sheet is set up

The one-time setup is in `apps-script/SETUP.md`. Short version:

1. Create a Google Sheet.
2. **Extensions > Apps Script**, paste `apps-script/Code.gs`.
3. **Project Settings > Script properties**, add `PASSCODE` and a code you make up. Do not put that code in GitHub.
4. **Deploy > New deployment > Web app**. Execute as **Me**. Who has access: **Anyone**. Authorize it.
5. Copy the URL that ends in `/exec`.
6. Paste it into `js/results-config.js` as `submitUrl`, and commit that to `main`. Leave the passcode out of the file.
7. On the phone, enter a game and tap **Submit results**. The first time, type the passcode. It stays on that phone.
8. You should see **Submitted. This game is on the public results page.**

To change the script later: **Deploy > Manage deployments > pencil > New version > Deploy**. The same `/exec` URL keeps working.

To hide a game, tap **On the public page** until it says **Hidden from public page**.

If you are offline, Submit keeps the game on the phone and sends it the next time you tap Submit while online. **Change results passcode** is on the Games screen. **Download results file** is there if Google cannot be reached.

### If the web address is not set up yet

1. Tap **Submit results**. That downloads `results.json` for every game marked final.
2. On GitHub, open this repo, click **Add file**, then **Upload files**.
3. Drop `results.json` in and commit it to **main**.

The page updates in a minute or two.

## Back up, or move stats to another phone

1. On **Games** or **Stats**, tap **Download backup**. That saves one file with both teams, rosters, and every game.
2. AirDrop, text, or email that file to the other phone.
3. On the other phone, open the app and tap **Restore backup**.
4. Choose the file and confirm. Restore replaces whatever is already on that phone.

**Export season CSV** and **Export this game** make spreadsheets. Percentages in the CSV are numbers like `62.5` for 62.5%.

If you clear Safari website data, or delete the home-screen app, the stats on that phone go with it. Download a backup first if you want to keep them.

## Offline

After the home-screen app has opened once with service, the pages are stored on the phone. You can keep entering a game with no signal. Stats are saved in the phone's local storage either way. Open the app once online after it changes so the phone picks up the new version.
