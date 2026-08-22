// e2e: signed-in reservation flow — reserve a couple of surplus bags, see
// the reservation in "My Reservations", look it up by pickup code, cancel
// it. Verifies the displayed cart total matches what the server actually
// charges (a real bug this exact pattern caught earlier: float math in the
// UI vs. integer-paise math on the server).
//
// Requires a `users` row for uid=100 to exist (see tests/README.md).
const { chromium } = require("playwright");
const { launchBrowser, signTestToken, FRONTEND_ORIGIN } = require("./helpers");

(async () => {
  const token = signTestToken({ uid: 100, email: "testcustomer@example.com", role: "customer" });
  const browser = await launchBrowser(chromium);
  const errors = [];
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(FRONTEND_ORIGIN + "/");
  await page.evaluate((t) => localStorage.setItem("mitcham_token", t), token);
  await page.reload();
  await page.waitForSelector("#userName");
  console.log("1. Signed in as:", await page.textContent("#userName"));

  await page.goto(FRONTEND_ORIGIN + "/#/v/spice-route-kitchen/reserve");
  await page.waitForSelector("#orderMenu .menu-card");
  await page.click("#orderMenu .menu-card >> nth=0 >> .add-btn");
  await page.waitForTimeout(200);
  await page.click("#orderMenu .menu-card >> nth=1 >> .add-btn");
  await page.waitForTimeout(200);
  const displayedTotal = await page.textContent("#cartTotal");
  console.log("2. Cart total (displayed):", displayedTotal);

  await page.fill("#orderName", "Playwright Tester");
  await page.click("#checkoutBtn");
  await page.waitForSelector("#checkoutResult.show", { timeout: 5000 });
  const resultText = (await page.textContent("#checkoutResult")).replace(/\s+/g, " ").trim();
  console.log("3. Reservation result:", resultText);
  const chargedMatch = resultText.match(/You paid (₹[\d,]+)/);
  const chargedTotal = chargedMatch?.[1];
  if (displayedTotal !== chargedTotal) {
    throw new Error(`Displayed cart total (${displayedTotal}) != charged total (${chargedTotal})`);
  }
  console.log("   displayed total matches charged total: OK");
  const pickupCode = resultText.match(/M\d+-\d+T\d+/)?.[0];
  console.log("   pickup code:", pickupCode);

  console.log("4. My Reservations shows the new reservation...");
  await page.goto(FRONTEND_ORIGIN + "/#/my-reservations");
  await page.waitForSelector("#ordersBody tr");
  console.log("   pickup codes:", await page.$$eval("#ordersBody td.barcode-cell", (els) => els.map((e) => e.textContent)));

  console.log("5. Look up by pickup code (item names should be resolved, not raw ids)...");
  await page.fill("#retrBarcode", pickupCode);
  await page.click("#retrBtn");
  await page.waitForTimeout(300);
  const retrText = (await page.textContent("#retrResult")).replace(/\s+/g, " ").trim();
  console.log("   ", retrText);
  if (/listing #\d+/.test(retrText)) throw new Error("Lookup result fell back to raw listing ids instead of names");

  console.log("6. Cancel — confirmation message must survive the table refresh...");
  await page.fill("#cancelBarcode", pickupCode);
  await page.click("#cancelBtn");
  await page.waitForTimeout(500);
  const cancelText = (await page.textContent("#cancelResult")).trim();
  console.log("   ", cancelText);
  if (!cancelText.includes("Cancelled")) throw new Error("Cancel confirmation message did not persist");

  console.log("\n=== JS errors observed ===");
  console.log(errors.length === 0 ? "none" : errors.join("\n"));
  await browser.close();
  if (errors.length > 0) process.exit(1);
})().catch((err) => { console.error("TEST FAILED:", err); process.exit(1); });
