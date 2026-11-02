# Bulk deletion verification

Run `npm run test:crm` for all CRM kinds, product prerequisites, history protection, deduplication, conflicts, queue cancellation and bounded concurrency.

After `npm run build:vercel`, run the browser suite with a local Playwright installation and Chromium executable:

```sh
node node_modules/esbuild/bin/esbuild tests/bulk-delete-ui.ts --bundle --platform=node --format=esm --packages=external --outfile=tests/bulk-delete-ui.bundle.mjs
PEYVAND_PLAYWRIGHT_MODULE=/absolute/path/to/playwright PEYVAND_CHROMIUM_EXECUTABLE=/absolute/path/to/chromium node tests/bulk-delete-ui.bundle.mjs
```

The suite starts a disposable local Next server and intercepts every browser API call with synthetic fixtures. It covers account sublists, leads, contacts, filtered and cancelled selection, protected parent records, pipeline stages, mixed activities and legacy tasks, partial failures, proformas, automation cards, inventory products, returned materials, individual sample dispatches, viewer and sales permissions, mobile layout and browser exceptions. No real CRM users or data are used.

The existing `forecast-ui.ts` and `navigation-ui.ts` suites also pass with these changes. Stock movement documents and audit history remain protected; this feature uses existing deletion APIs and their version and permission checks.
