# Peyvand CRM 0.5.5 — checkpoint

Based on corrected 0.5.4 desktop source and GitHub commit 26d3b9e2b79264aa11c9068dd1c525ee01496864 (online confirmation fix).

Implemented in this build: activity types, Persian start/end dates, times, progress, activity state, in-app reminders while open, public filters, personal device-local saved views; direct pinned esbuild build dependency. Existing tasks retained.

Remaining requested work: email/WhatsApp types, related person and relationship validation across leads/contacts/deals, full related activity timelines, pipeline-stage linking, near-due dashboard cards, filtered activity/customer/lead reports and PDF. Online activity release not deployed. SMTP remains unresolved; no provider rejection root cause verified.

Desktop store tests: 9 passed after build. Windows execution not tested.
