// e2e: anonymous browsing — marketplace, search/filter, storefront, cart,
// static pages, and the 404 route. No auth required.
const { chromium } = require("playwright");
const { launchBrowser, FRONTEND_ORIGIN } = require("./helpers");

(async () => {
  const browser = await launchBrowser(chromium);
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() === "error" && !msg.text().includes("Failed to load resource")) errors.push(`console.error: ${msg.text()}`);
  });

  console.log("1. Load marketplace...");
  await page.goto(FRONTEND_ORIGIN + "/");
  await page.waitForSelector(".vendor-card", { timeout: 5000 });
  console.log("   vendors:", await page.$$eval(".vendor-card h4", (els) => els.map((e) => e.textContent)));

  console.log("2. Filter by category=Bakery...");
  await page.selectOption("#categorySelect", "Bakery");
  await page.waitForTimeout(300);
  console.log("   filtered:", await page.$$eval(".vendor-card h4", (els) => els.map((e) => e.textContent)));

  console.log("3. Search 'sweets'...");
  await page.goto(FRONTEND_ORIGIN + "/");
  await page.fill("#searchInput", "sweets");
  await page.waitForTimeout(500);
  console.log("   searched:", await page.$$eval(".vendor-card h4", (els) => els.map((e) => e.textContent)));

  console.log("4. Visit storefront...");
  await page.goto(FRONTEND_ORIGIN + "/");
  await page.click(".vendor-card");
  await page.waitForSelector(".menu-card", { timeout: 5000 });
  console.log("   surplus listings:", await page.$$eval(".menu-card", (els) => els.length));

  console.log("5. Add a bag to cart, without signing in...");
  await page.click("text=Reserve a Bag");
  await page.waitForSelector("#orderMenu .menu-card");
  await page.click("#orderMenu .menu-card .add-btn");
  await page.waitForTimeout(300);
  console.log("   cart total:", await page.textContent("#cartTotal"));
  console.log("   checkout enabled (cart has item):", !(await page.$eval("#checkoutBtn", (b) => b.disabled)));

  console.log("6. For Vendors pitch page...");
  await page.goto(FRONTEND_ORIGIN + "/#/for-vendors");
  await page.waitForSelector(".pitch-grid");
  console.log("   pitch cards:", await page.$$eval(".pitch-card h4", (els) => els.length));

  console.log("7. My Reservations redirects to sign-in prompt...");
  await page.goto(FRONTEND_ORIGIN + "/#/my-reservations");
  await page.waitForSelector(".empty-state");
  console.log("   ", await page.textContent(".empty-state h3"));

  console.log("8. Unknown route -> 404 view...");
  await page.goto(FRONTEND_ORIGIN + "/#/does-not-exist");
  await page.waitForSelector(".empty-state");
  console.log("   ", await page.textContent(".empty-state h3"));

  console.log("\n=== JS errors observed ===");
  console.log(errors.length === 0 ? "none" : errors.join("\n"));
  await browser.close();
  if (errors.length > 0) process.exit(1);
})().catch((err) => { console.error("TEST FAILED:", err); process.exit(1); });
