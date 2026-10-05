# Page visibility

Run `node server.js` and open http://localhost:5173. The local toolbar beneath the navigation has two controls:

- **View → All pages / Public only** previews the complete site or just the pages included in a release. The selection persists across navigation and reloads.
- **This page → Published / Local only** saves the current page's flag in `site-pages.json`. This prepares the next release; it does not deploy anything. Amber dots identify local-only navigation links.

The initial published pages match the live site checked October 5, 2026: Bossing, Gem Leveling, Triangle Arbitrage for PoE 1 and PoE 2 (previously Currency Exchange), and Breachstone Flip. The other nine pages are local-only. New pages default to local-only. Keep `index.html` published as the public entry page.

Run `node scripts/test-site-pages.js` to check flags, saved changes, direct URL blocking, and release output. Run `node scripts/build-public-site.js` to generate `.public-site/`. Only published HTML pages are copied; links to local-only pages are removed. Source pages stay in the project. Deploy the generated directory to obtain actual 404s for excluded pages, including when JavaScript is disabled.

The GitHub publishing workflow builds this directory and copies it into the `gh-pages` branch after updating market data. It removes previously published pages that have been marked local-only.
