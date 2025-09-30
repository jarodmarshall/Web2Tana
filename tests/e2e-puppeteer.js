const puppeteer = require('puppeteer');
const path = require('path');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const filePath = 'file://' + path.resolve(__dirname, '../tests/test_page.html');
  await page.goto(filePath);
  // Make a selection programmatically: select the paragraph text
  await page.evaluate(() => {
    const p = document.getElementById('para');
    const range = document.createRange();
    range.selectNodeContents(p);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  // Call the helper created in the test page
  const tana = await page.evaluate(() => window.getTanaFromPage({ selectionText: window.getSelection().toString() }));
  console.log('Tana output:\n', tana);
  await browser.close();
})();