# Set up one-tap Submit with Google Sheets

Do this once, on a computer if you can. After it works, submitting a game from the iPhone is one tap.

The passcode is the only thing that can add or hide a public game. The web address can be in the app. Do not put the passcode in GitHub, in a text that gets forwarded around, or in `js/results-config.js`.

Anyone will be able to view the results page. Only someone with the passcode can change it.

## 1. Make the Google Sheet

1. On a computer, open [Google Sheets](https://sheets.google.com) and sign in with the Google account that should own the results.
2. Click **Blank spreadsheet**.
3. Name it something you will recognize, such as `Lacrosse results`.

On an iPhone: open Safari, go to the same link, tap the **aA** button, then **Request Desktop Website**, and follow the same clicks. A computer is easier for the next part.

## 2. Add the script

1. In the spreadsheet, click **Extensions**.
2. Click **Apps Script**.
3. A new tab opens with a file called `Code.gs`. Select all the sample code and delete it.
4. Open `apps-script/Code.gs` from this project and copy the whole file.
5. Paste it into the Apps Script tab.
6. Click the save icon (or press Ctrl+S / Command+S).

Leave this script attached to the spreadsheet. Do not start a separate Apps Script project from script.google.com. The script has to be opened from the sheet.

## 3. Set the passcode

1. In the Apps Script tab, click the gear icon, **Project Settings**.
2. Under **Script properties**, click **Add script property**.
3. Property name: `PASSCODE`
4. Property value: a code you make up. Use a few words you can type on a phone. This is not your Google password.
5. Click **Save script properties**.

The code is stored by Google with the script. It is not written in `Code.gs`.

## 4. Deploy the web app

1. Click **Deploy**, then **New deployment**.
2. Click the gear next to **Select type** and choose **Web app**.
3. Description: `Lacrosse results`.
4. **Execute as**: **Me**.
5. **Who has access**: **Anyone**.
6. Click **Deploy**.
7. Google asks you to authorize. Click through, choose your account, and allow access to the spreadsheet.
8. Copy the **Web app URL**. It ends in `/exec`.

That address is what the phone posts to. Viewing stays public. Writing still needs the passcode.

## 5. Put the address in the app

1. Open `js/results-config.js` in this project.
2. Paste the `/exec` URL between the quotes on the `submitUrl` line:

```js
submitUrl: "https://script.google.com/macros/s/......../exec",
```

3. Leave the passcode out of that file.
4. Commit that change to the `main` branch (or send the URL to whoever updates the site).
5. Wait a minute, then open the stat app from the home screen once while you have service so the phone picks up the new version.

## 6. Try it from the phone

1. Open the stat app.
2. Enter a game, then tap **Submit results**.
3. The first time, it asks for the results passcode. Type the same code you saved as `PASSCODE`. It stays on that phone.
4. You should see **Submitted. This game is on the public results page.**
5. Open https://stevenglow11.github.io/lacrosse-stats/results.html and confirm the game is there.

To change the passcode on the phone later: Games, then **Change results passcode**.

To hide a game: on that game tap **On the public page** so it says **Hidden from public page**. That tells the sheet to hide it.

If you are offline, Submit saves the game on the phone and sends it the next time you tap Submit while online.

**Download results file** is the backup if Google cannot be reached. You can still upload that `results.json` by hand.

## 7. If you change the script later

1. Apps Script, **Deploy**, **Manage deployments**.
2. Click the pencil on the active web app.
3. **Version**: **New version**.
4. Click **Deploy**.

The `/exec` address stays the same. You do not paste a new URL.

Changing only the passcode in Script properties does not need a new deployment.
