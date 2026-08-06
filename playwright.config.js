module.exports = {
  testDir: "./tests",
  timeout: 60000,
  use: {
    browserName: "chromium",
    headless: true,
    viewport: { width: 1280, height: 720 },
  },
};
