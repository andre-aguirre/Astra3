# Astra3 website

The official website for Astra3, built with [Astro](https://astro.build) and TypeScript. It's a static site with no runtime framework; the only client-side scripts are the star field, the hero molecule, the feature showcase, the docs navigation, the citation tabs and the screenshot lightbox.

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