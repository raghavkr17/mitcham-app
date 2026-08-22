// Quick Playwright smoke check for the Mitcham frontend — loads the
// marketplace, checks for console errors, checks the impact strip and
// vendor grid rendered, then visits a storefront and checks listing cards.
const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({
    executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome",
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage();
  const errors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));

  await page.goto("http://localhost:5500/#/", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const vendorCards = await page.locator(".vendor-card").count();
  const impactItems = await page.locator(".impact-item").count();
  console.log("marketplace: vendorCards=", vendorCards, "impactItems=", impactItems);

  await page.goto("http://localhost:5500/#/v/spice-route-kitchen", { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const menuCards = await page.locator(".menu-card").count();
  const priceOriginal = await page.locator(".price-original").count();
  const discountBadge = await page.locator(".discount-badge").count();
  console.log("storefront: menuCards=", menuCards, "priceOriginal=", priceOriginal, "discountBadge=", discountBadge);

  await page.goto("http://localhost:5500/#/for-vendors", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  await page.goto("http://localhost:5500/#/my-reservations", { waitUntil: "networkidle" });
  await page.waitForTimeout(300);

  console.log("console/page errors:", errors.length ? errors : "none");
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})();
