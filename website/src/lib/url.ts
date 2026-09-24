/** Prefix a site path with the configured base, so the site works at a domain root or under /Astra3 on GitHub Pages. */
const base = import.meta.env.BASE_URL.replace(/\/?$/, '/');
export const u = (path: string) => base + path.replace(/^\//, '');
