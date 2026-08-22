// e2e: the full vendor-onboarding loop — someone applies to list a
// vendor, manages its surplus listings (add/restock/hide), and a
// platform admin approves it, after which it appears in the public
// marketplace.
//
// Requires `users` rows for uid=100 (customer/vendor) and uid=1 (platform
// admin) — see tests/README.md.
const { chromium } = require("playwright");
const { launchBrowser, signTestToken, FRONTEND_ORIGIN } = require("./helpers");

(async () => {
  const ownerToken = signTestToken({ uid: 100, email: "testcustomer@example.com", role: "customer" });
  const adminToken = signTestToken({ uid: 1, email: "admin@mitcham.local", role: "platform_admin" });
  const browser = await launchBrowser(chromium);
  const errors = [];
  const uniqueName = `Playwright Bagels ${Date.now()}`;

  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));

  await page.goto(FRONTEND_ORIGIN + "/");
  await page.evaluate((t) => localStorage.setItem("mitcham_token", t), ownerToken);
  await page.reload();
  await page.waitForSelector("#userName");

  console.log("1. Submit a new vendor application...");
  await page.goto(FRONTEND_ORIGIN + "/#/list-vendor");
  await page.waitForSelector("#applyForm");
  await page.fill('#applyForm [name="name"]', uniqueName);
  await page.selectOption('#applyForm [name="category"]', "Bakery");
  await page.fill('#applyForm [name="tagline"]', "Boiled, then baked, rescued at close.");
  await page.fill('#applyForm [name="description"]', "A test bakery created by the e2e suite.");
  await page.click('#applyForm button[type="submit"]');
  await page.waitForSelector("#applyResult span", { timeout: 5000 });
  console.log("   ", (await page.textContent("#applyResult")).trim());

  console.log("2. It shows up under Manage (status: pending)...");
  await page.goto(FRONTEND_ORIGIN + "/#/manage");
  await page.waitForSelector("#manageGrid");
  const managed = await page.$$eval("#manageGrid h4", (els) => els.map((e) => e.textContent));
  if (!managed.includes(uniqueName)) throw new Error("New vendor did not appear under Manage");

  console.log("3. Add a surplus listing, restock it, then hide it...");
  const href = await page.$$eval("#manageGrid a", (as, name) => as.find((a) => a.querySelector("h4").textContent === name)?.getAttribute("href"), uniqueName);
  await page.goto(FRONTEND_ORIGIN + "/" + href);
  await page.waitForSelector("#newItemForm");
  await page.fill('#newItemForm [name="name"]', "Everything Bagel Box");
  await page.fill('#newItemForm [name="originalPrice"]', "150");
  await page.fill('#newItemForm [name="discountPrice"]', "60");
  await page.fill('#newItemForm [name="emoji"]', "🥯");
  await page.fill('#newItemForm [name="initialBags"]', "40");
  await page.click('#newItemForm button[type="submit"]');
  await page.waitForTimeout(500);
  const items = await page.$$eval("#manageMenuGrid h4", (els) => els.map((e) => e.textContent));
  if (!items.includes("Everything Bagel Box")) throw new Error("New surplus listing was not added");

  await page.fill(".menu-card .restock-input", "77");
  await page.click(".menu-card .restock-btn");
  await page.waitForTimeout(400);
  await page.click(".menu-card .toggle-btn");
  await page.waitForTimeout(300);
  console.log("   pill after hide:", (await page.textContent(".menu-card .stock-pill")).trim());

  console.log("4. It is NOT yet in the public marketplace (still pending)...");
  await page.goto(FRONTEND_ORIGIN + "/#/");
  await page.waitForSelector(".vendor-card");
  let market = await page.$$eval(".vendor-card h4", (els) => els.map((e) => e.textContent));
  if (market.includes(uniqueName)) throw new Error("Pending vendor leaked into public marketplace before approval");

  console.log("5. Platform admin approves it...");
  const adminPage = await browser.newPage();
  adminPage.on("pageerror", (e) => errors.push(`[admin] ${e.message}`));
  await adminPage.goto(FRONTEND_ORIGIN + "/");
  await adminPage.evaluate((t) => localStorage.setItem("mitcham_token", t), adminToken);
  await adminPage.reload();
  await adminPage.goto(FRONTEND_ORIGIN + "/#/admin");
  await adminPage.waitForSelector("#pendingGrid");
  const pendingCards = await adminPage.$$('#pendingGrid .vendor-card');
  let approved = false;
  for (const card of pendingCards) {
    const name = await card.$eval("h4", (h) => h.textContent);
    if (name === uniqueName) {
      await card.$eval(".approve-btn", (b) => b.click());
      approved = true;
      break;
    }
  }
  if (!approved) throw new Error("Could not find the pending application in the admin queue");
  await adminPage.waitForTimeout(500);

  console.log("6. Now visible in the public marketplace...");
  await adminPage.goto(FRONTEND_ORIGIN + "/#/");
  await adminPage.waitForSelector(".vendor-card");
  market = await adminPage.$$eval(".vendor-card h4", (els) => els.map((e) => e.textContent));
  if (!market.includes(uniqueName)) throw new Error("Approved vendor did not appear in marketplace");
  console.log("   marketplace now includes:", uniqueName);

  console.log("\n=== JS errors observed ===");
  console.log(errors.length === 0 ? "none" : errors.join("\n"));
  await browser.close();
  if (errors.length > 0) process.exit(1);
})().catch((err) => { console.error("TEST FAILED:", err); process.exit(1); });
