import { readFileSync } from "node:fs";
import vm from "node:vm";

class FakeSheet {
  constructor(name) {
    this.name = name;
    this.rows = [];
  }

  appendRow(row) {
    this.rows.push(row.map((cell) => cell));
  }

  setFrozenRows() {}

  getDataRange() {
    const rows = this.rows.length ? this.rows : [[]];
    return { getValues: () => rows.map((row) => row.slice()) };
  }

  getRange(row, col, numRows, numCols) {
    const sheet = this;
    return {
      setValues(values) {
        for (let r = 0; r < numRows; r += 1) {
          while (sheet.rows.length < row + r) sheet.rows.push([]);
          const target = sheet.rows[row - 1 + r];
          for (let c = 0; c < numCols; c += 1) target[col - 1 + c] = values[r][c];
        }
      },
      getValues() {
        const out = [];
        for (let r = 0; r < numRows; r += 1) {
          const source = sheet.rows[row - 1 + r] || [];
          const line = [];
          for (let c = 0; c < numCols; c += 1) line.push(source[col - 1 + c]);
          out.push(line);
        }
        return out;
      },
    };
  }

  getLastRow() {
    return this.rows.length;
  }
}

export function createGasApp(passcode) {
  const sheets = {};
  const props = { PASSCODE: passcode };
  const context = {
    PropertiesService: {
      getScriptProperties() {
        return {
          getProperty(key) {
            return Object.prototype.hasOwnProperty.call(props, key) ? props[key] : null;
          },
        };
      },
    },
    SpreadsheetApp: {
      getActiveSpreadsheet() {
        return {
          getSheetByName(name) {
            return sheets[name] || null;
          },
          insertSheet(name) {
            const sheet = new FakeSheet(name);
            sheets[name] = sheet;
            return sheet;
          },
        };
      },
    },
    LockService: {
      getScriptLock() {
        return { waitLock() {}, releaseLock() {} };
      },
    },
    ContentService: {
      MimeType: { JSON: "application/json", JAVASCRIPT: "application/javascript", TEXT: "text/plain" },
      createTextOutput(text) {
        const out = { text, mime: "text/plain" };
        out.setMimeType = (mime) => {
          out.mime = mime;
          return out;
        };
        out.getContent = () => out.text;
        return out;
      },
    },
    console,
  };
  vm.createContext(context);
  vm.runInContext(readFileSync(new URL("../apps-script/Code.gs", import.meta.url), "utf8"), context, { filename: "Code.gs" });
  return {
    post(body) {
      const out = context.doPost({ postData: { type: "text/plain", contents: JSON.stringify(body) }, parameter: {} });
      return JSON.parse(out.getContent());
    },
    get(parameter = {}) {
      const out = context.doGet({ parameter });
      return { mime: out.mime, text: out.getContent() };
    },
    rows() {
      return sheets.Games ? sheets.Games.rows.map((row) => row.slice()) : [];
    },
  };
}
