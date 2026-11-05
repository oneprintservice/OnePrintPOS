ONEPRINT POS + PRINT TEST — INTEGRATED BETA PACKAGE

Basis:
- Source ZIP supplied by user: OnePrintPOS-main (CNAME: oneprintservice.web.id)
- Print Test page baseline: v4 page/CSS/diagnostic structure
- Latest Print Test JavaScript: v7

Integration:
- Added a public "Printer Test" card to the landing page index.html,
  alongside Chat Admin, Lokasi Servis, and Tracking Servis.
- Public page: /print-test.html
- Technician diagnostic page: /service-tools/diagnostic.html
- Shared assets: /assets/print-test/

No changes were made to login.html, app.html, Firebase configuration,
POS business logic, service data, or service worker.

Deployment recommendation:
1. Treat this as a beta test package first.
2. Review the diff before replacing repository files.
3. Deploy to the beta branch/site, not production/main.
4. Test landing page button, public test page, diagnostic page,
   print preview, and physical A4 output.

Important:
The supplied source ZIP contains CNAME oneprintservice.web.id, so it appears
to be a production-domain source snapshot. Confirm the beta repository's
current files before using this package to overwrite the entire beta branch.
