// Publishing hook shared by the public page and the Submit button.
//
// results.html only reads `resultsUrl`. It does not care how the JSON got there.
// Leave `submitUrl` empty to download results.json and upload it on GitHub.
//
// Later, set `submitUrl` to an https address that accepts
// POST application/json with the same body results.html already understands,
// and stores that body where `resultsUrl` points. You can also point
// `resultsUrl` at that host's GET address. Change nothing else.
//
// Do not put tokens, passwords, or GitHub credentials in this file.
// Submit sends the public JSON and nothing else. No Authorization header.

export const RESULTS_CONFIG = {
  resultsUrl: "./results.json",
  submitUrl: "",
};
