// Publishing hook shared by the public page and the Submit button.
//
// submitUrl is set to the deployed Apps Script web app.
// Submit POSTs the public JSON there (Content-Type text/plain, no token)
// and results.html loads the same address with GET.
//
// Do not put the passcode, a token, or a GitHub password in this file.
// The passcode lives in the phone's local storage and in the Sheet's script properties.

export const RESULTS_CONFIG = {
  resultsUrl: "./results.json",
  submitUrl: "https://script.google.com/macros/s/AKfycbzB7ToPy85DcKmLBrfJv1cNFHBSBBpu_OY-CyEaxL2W2dV5j5JRr0SJK6wcfCX94EXL/exec",
};

function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isLocalTestUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname;
    return (url.protocol === "http:" || url.protocol === "https:") && (host === "127.0.0.1" || host === "localhost");
  } catch {
    return false;
  }
}

export function activeSubmitUrl() {
  try {
    const injected = globalThis.window?.__LAX_SUBMIT_URL__;
    if (injected === "") return "";
    if (typeof injected === "string" && isLocalTestUrl(injected.trim())) return injected.trim();
  } catch {
    /* no window while testing the publisher in Node */
  }
  const configured = String(RESULTS_CONFIG.submitUrl || "").trim();
  if (isHttpUrl(configured)) return configured;
  return "";
}
