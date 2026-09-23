# Astra3 website

The official website for Astra3, built with [Astro](https://astro.build) and TypeScript. It's a static site with no runtime framework; the only client-side scripts are the star field, the hero molecule, the feature showcase, the docs navigation, the citation tabs and the screenshot lightbox.

## Develop

```sh
npm install
npm run dev       # http://localhost:4321/Astra3/
npm run build     # type-checks, then writes dist/
npm run preview
```

## Everything that changes lives in `src/config.ts`

- `version`, `releases` (changelog), `screenshots` (captions)
- `latestReleaseUrl`: the macOS button links to GitHub's `/releases/latest`, so a new `.dmg` never needs a site rebuild
- `platforms.<macos|windows>.status` and `url`: whether a platform can be downloaded and where from. Windows links to its Microsoft Store page. Setting a platform back to `'comingSoon'` switches its buttons, cards and page headings to "Coming soon" everywhere.
- `demoVideoUrl`: set an embed URL to replace the "Demo video coming soon" poster

## Deploy

The site lives in the `website/` folder of the Astra3 repository. `.github/workflows/deploy-website.yml` (at the repository root) builds it and publishes to GitHub Pages whenever `website/` changes on `main`, or when run by hand from the Actions tab (Settings → Pages → Source: GitHub Actions). The address is `https://andre-aguirre.github.io/Astra3/`.

For a custom domain, set `SITE_URL=https://your.domain` and `BASE_PATH=/` in the workflow, then add a `public/CNAME` file. Canonical URLs, Open Graph tags, the sitemap and `robots.txt` all follow these two values.

## Structure

```
src/
  config.ts                 central configuration
  layouts/BaseLayout.astro  <head>: title, description, canonical, Open Graph, Twitter, JSON-LD
  components/               Navbar, Footer, Hero, StarField, FeatureShowcase, DownloadButton,
                            PlatformCard, PlatformButtons, PlatformNote, VideoSection, ResearchSection (citation),
                            DocumentationLayout, CTA, PageTransition
  pages/                    /, /features, /download, /docs, /research, /changelog, /privacy, /about, 404
  lib/molecule.js           hero Cα-trace renderer (an illustration, not a real structure)
  styles/global.css         design tokens taken from the Astra3 app's own stylesheet
public/img/                 app screenshots (WebP, 800 and 1600 px), logo
```

## Keep in step with the app

- The Privacy page mirrors `PRIVACY.md` at the repository root (the policy the app shows and the Microsoft Store links to). Change both together.
- Fonts are bundled from npm (`@fontsource`), so the site makes no requests to font services.

## Hero structure

The hero draws real structures as cartoons with 3Dmol.js (the library Astra3's own viewer uses), cycling through `public/models/*.pdb`: backbone-only copies of PDB 1ERJ (chain C), 1AKE (chain A) and 3FXI (chains A and C, TLR4 and MD-2), keeping their helix and sheet records (3FXI's come from PyMOL's assignment in the session it was taken from). 1ERJ and 3FXI are rigidly rotated so each faces the viewer. The list and captions are in `src/lib/hero3d.js`. 3Dmol.js is served from `public/vendor/` with its BSD-3-Clause licence alongside it. Without WebGL, the hero falls back to a Cα trace drawn from `src/lib/trace-data.json` (`node scripts/make-trace.mjs <file.pdb> [chain] [label]` regenerates it).
