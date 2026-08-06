const path = require("node:path");
const { expect, test } = require("@playwright/test");

function fileUrl(relativePath) {
  const absolute = path.resolve(__dirname, "..", relativePath).replace(/\\/g, "/");
  return `file:///${absolute}`;
}

async function openGame(page) {
  await page.goto(`${fileUrl("index.html")}?mapSeed=7331&networkDiagnostics=1`);
  const intro = page.locator("#intro-screen");
  if (await intro.isVisible().catch(() => false)) {
    await page.keyboard.press("KeyM");
    await expect(intro).toBeHidden();
  }
  await page.waitForFunction(() => Boolean(
    window.__dustMultiplayerTest?.trimHazardUpsertsForTest
  ));
}

test("hazard upsert trimming preserves exact priority and byte budgets without quadratic serialization", async ({ page }) => {
  await openGame(page);

  const result = await page.evaluate(() => {
    const api = window.__dustMultiplayerTest;
    const encoder = new TextEncoder();
    const wireBytes = (value) => encoder.encode(JSON.stringify(value)).byteLength;
    const kinds = ["acidPuddles", "rifleTraps", "firePatches"];

    // This is the previous implementation kept here as an output oracle and
    // as a same-browser performance baseline for the regression assertion.
    function legacyTrim(upserts, byteBudget) {
      if (!upserts || typeof upserts !== "object") return undefined;
      const trimmed = { firePatches: [], rifleTraps: [], acidPuddles: [] };
      const hostile = { firePatches: [], rifleTraps: [], acidPuddles: [] };
      const ordinary = { firePatches: [], rifleTraps: [], acidPuddles: [] };
      kinds.forEach((kind) => {
        (Array.isArray(upserts[kind]) ? upserts[kind] : []).forEach((entry) => {
          const destination = entry && String(entry.ownerId || "").startsWith("doppel:")
            ? hostile[kind]
            : ordinary[kind];
          destination.push(entry);
        });
      });

      function appendRoundRobin(sources) {
        const cursors = { firePatches: 0, rifleTraps: 0, acidPuddles: 0 };
        let progressed = true;
        while (progressed) {
          progressed = false;
          for (const kind of kinds) {
            if (cursors[kind] >= sources[kind].length) continue;
            trimmed[kind].push(sources[kind][cursors[kind]]);
            if (wireBytes(trimmed) > byteBudget) {
              trimmed[kind].pop();
              cursors[kind] = sources[kind].length;
              continue;
            }
            cursors[kind] += 1;
            progressed = true;
          }
        }
      }

      appendRoundRobin(hostile);
      appendRoundRobin(ordinary);
      return trimmed.firePatches.length || trimmed.rifleTraps.length || trimmed.acidPuddles.length
        ? trimmed
        : undefined;
    }

    function makeEntries(kind, count, salt) {
      return Array.from({ length: count }, (_, index) => ({
        id: `${kind}-${index}`,
        ownerId: index % 13 === 0 ? `doppel:clone-${index}` : `player-${index % 4}`,
        x: Number((index * 1.137 + salt).toFixed(3)),
        z: Number((index * -0.713 - salt).toFixed(3)),
        radius: Number((2.5 + (index % 7) * 0.17).toFixed(2)),
        ttl: 4 + (index % 9),
        label: index % 5 === 0 ? `огонь-${index}-🔥` : `${kind}-payload-${index}`,
      }));
    }

    const upserts = {
      firePatches: makeEntries("fire", 128, 0.25),
      rifleTraps: makeEntries("trap", 96, 1.5),
      acidPuddles: makeEntries("acid", 50, 2.75),
    };
    // Cover JSON array semantics that differ from standalone JSON values.
    upserts.firePatches.splice(3, 0, undefined);
    upserts.rifleTraps.splice(5, 0, null);
    const before = JSON.stringify(upserts);
    const budgets = [32, 64, 127, 256, 511, 1024, 2048, 4096, 8192, 32768];
    const comparisons = budgets.map((budget) => {
      const expected = legacyTrim(upserts, budget);
      const actual = api.trimHazardUpsertsForTest(upserts, budget);
      return {
        budget,
        same: JSON.stringify(actual) === JSON.stringify(expected),
        bytes: actual ? wireBytes(actual) : 0,
      };
    });

    // Warm both paths so the ratio measures the algorithm rather than parsing
    // or first-call JIT overhead.
    for (let index = 0; index < 20; index += 1) {
      api.trimHazardUpsertsForTest(upserts, 4096);
      legacyTrim(upserts, 4096);
    }

    let optimizedMs = 0;
    let legacyMs = 0;
    let checksum = 0;
    for (let index = 0; index < 160; index += 1) {
      let startedAt = performance.now();
      const optimized = api.trimHazardUpsertsForTest(upserts, 4096);
      optimizedMs += performance.now() - startedAt;
      checksum += optimized.firePatches.length + optimized.rifleTraps.length + optimized.acidPuddles.length;

      startedAt = performance.now();
      const baseline = legacyTrim(upserts, 4096);
      legacyMs += performance.now() - startedAt;
      checksum += baseline.firePatches.length + baseline.rifleTraps.length + baseline.acidPuddles.length;
    }

    return {
      comparisons,
      inputUnchanged: JSON.stringify(upserts) === before,
      optimizedMs,
      legacyMs,
      checksum,
    };
  });

  expect(result.inputUnchanged).toBe(true);
  expect(result.comparisons.every((sample) => sample.same)).toBe(true);
  expect(result.comparisons.every((sample) => !sample.bytes || sample.bytes <= sample.budget)).toBe(true);
  expect(result.checksum).toBeGreaterThan(0);
  expect(result.optimizedMs).toBeLessThan(result.legacyMs * 0.55);
});
