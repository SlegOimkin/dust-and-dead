"use strict";

const { createDirectorApplication } = require("./app.js");
const { reportStartupFailure, runService } = require("../service-main.js");

async function main() {
  await runService(() => createDirectorApplication());
}

if (require.main === module) {
  main().catch(reportStartupFailure);
}

module.exports = { main };
