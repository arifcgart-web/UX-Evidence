/** Everything about the page we can know without asking. Runs in the page. */

import type { CaptureContext } from '../types/evidence';

const PAGE_TYPE_RULES: Array<[RegExp, string]> = [
  [/\/(checkout|payment|kasse|zahlung)(\/|$|\?)/i, 'Checkout'],
  [/\/(cart|basket|bag|warenkorb)(\/|$|\?)/i, 'Cart'],
  [/\/(products?|produkt|item|p|dp)\//i, 'Product page'],
  [/\/(collections?|category|categories|kategorie|shop|c)\//i, 'Category page'],
  [/\/(pricing|preise|plans)(\/|$|\?)/i, 'Pricing'],
  [/\/(search|suche|s)(\/|$|\?)/i, 'Search results'],
  [/\/(login|signin|sign-in|register|signup|sign-up|account)(\/|$|\?)/i, 'Account / auth'],
  [/\/(blog|articles?|news|magazin|journal)(\/|$)/i, 'Article'],
  [/\/(about|ueber-uns|uber-uns|team)(\/|$)/i, 'About'],
  [/\/(contact|kontakt|support|help|hilfe)(\/|$)/i, 'Support'],
];

function detectPageType(url: URL): string {
  const og = document.querySelector<HTMLMetaElement>('meta[property="og:type"]')?.content;
  if (og && /product/i.test(og)) return 'Product page';
  if (og && /article/i.test(og)) return 'Article';

  const path = url.pathname;
  for (const [pattern, label] of PAGE_TYPE_RULES) {
    if (pattern.test(path)) return label;
  }
  if (path === '/' || path === '') return 'Homepage';
  return '';
}

export function collectContext(): CaptureContext {
  const url = new URL(location.href);
  return {
    url: url.href,
    domain: url.hostname.replace(/^www\./, ''),
    pageTitle: document.title.trim().slice(0, 200),
    viewport: { width: window.innerWidth, height: window.innerHeight },
    pageType: detectPageType(url),
  };
}
