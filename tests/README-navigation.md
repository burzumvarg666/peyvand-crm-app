# Navigation verification

`npm test` checks workspace destinations, legacy links and role visibility.

For the browser test, build the Next app, provide a locally installed Playwright module and Chromium executable, then run:

```
npm run build:vercel
node node_modules/esbuild/bin/esbuild tests/navigation-ui.ts --bundle --platform=node --format=esm --packages=external --outfile=tests/navigation-ui.bundle.mjs
PEYVAND_PLAYWRIGHT_MODULE=/absolute/path/to/playwright PEYVAND_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium node tests/navigation-ui.bundle.mjs
```

The test starts a disposable local Next server and intercepts all browser API calls with synthetic data. It tests desktop and mobile navigation, moved reports and settings, product creation and automation dialogs, inventory deep links, viewer visibility, mobile drawer dismissal, page overflow and browser exceptions. It asserts that no mutation was requested. No real users, emails or CRM records are used. Screenshots are written to `PEYVAND_QA_DIR` (default `/tmp/peyvand-navigation-qa`).
