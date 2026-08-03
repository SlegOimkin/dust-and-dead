"use strict";

const { createOnlineApplication } = require("./app.js");
const { reportStartupFailure, runService } = require("./service-main.js");

async function main() {
  await runService(() => createOnlineApplication());
}

if (require.main === module) {
  main().catch(reportStartupFailure);
}

module.exports = { main };
