End-to-end testing for Copy as Tana Paste

Manual test (recommended)

1. Open Chrome (or Chromium-based browser) and go to chrome://extensions.
2. Enable Developer mode (top right).
3. Click "Load unpacked" and select the extension folder: `/Users/jarodmarshall/Desktop/tana-paste-extension`.
4. Open the test page shipped with the extension: `file:///Users/jarodmarshall/Desktop/tana-paste-extension/tests/test_page.html`.
5. Select some text on the page, right-click and choose "Copy as Tana Paste".
6. Paste into a text editor — you should see a Tana-formatted string starting with `%%tana%%`.
7. Try right-clicking a link or the page itself (no selection) and repeat.

Semi-automated test (requires Node & Puppeteer)

Notes: Chrome's extension context menu cannot be triggered from Puppeteer easily. This script runs the same formatter logic in the page context to verify output formatting. It's useful for regression checks of the formatter.

1. Install puppeteer in a temporary directory:

```bash
npm init -y
npm i puppeteer --save-dev
```

2. Create `tests/e2e-puppeteer.js` and run it with `node tests/e2e-puppeteer.js`.

Example script (semi-automated): the script will open the test page and evaluate `window.getTanaFromPage()` to verify it returns expected output.

Limitations
- This script does not exercise the extension's context menu or clipboard interactions (these need manual verification in the browser).

Running the included Puppeteer script locally

If you try to run `node tests/e2e-puppeteer.js` without installing puppeteer you'll get a "Cannot find module 'puppeteer'" error. Install puppeteer as shown above in the extension root (or in a workspace), then run:

```bash
node tests/e2e-puppeteer.js
```

The script will open the `tests/test_page.html`, select the sample paragraph, and print the Tana-formatted output produced by the page helper. It does not load the extension or trigger the extension context menu.

