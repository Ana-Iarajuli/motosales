import { shopify } from './adapters/shopify.js';
import { fcmoto } from './adapters/fcmoto.js';
import { dainese } from './adapters/dainese.js';
import { jsonld } from './adapters/jsonld.js';
import { apify } from './adapters/apify.js';

// `saleUrl` is the public sale page shown to users; `fetch` collects the products.
// `minIntervalHours` keeps a source's previous results until that long has passed (for paid sources).
export const SOURCES = [
  {
    id: 'revzilla',
    name: 'RevZilla',
    region: 'US',
    currency: 'USD',
    saleUrl: 'https://www.revzilla.com/sale',
    // revzilla.com blocks direct requests; with an Apify token we use a hosted scraper instead.
    ...(process.env.APIFY_TOKEN
      ? {
          fetch: apify({ actor: 'parseforge~revzilla-scraper', input: { searchQuery: process.env.REVZILLA_QUERY || '' } }),
          minIntervalHours: Number(process.env.APIFY_REFRESH_HOURS) || 24,
        }
      : { fetch: jsonld({ url: 'https://www.revzilla.com/sale' }) }),
  },
  {
    id: 'fcmoto',
    name: 'FC-Moto',
    region: 'EU / US',
    currency: 'USD',
    saleUrl: 'https://www.fc-moto.com/en-us/c/sale/',
    fetch: fcmoto({ url: 'https://www.fc-moto.com/en-us/c/sale/' }),
  },
  {
    id: 'alpinestars',
    name: 'Alpinestars',
    region: 'US',
    currency: 'USD',
    saleUrl: 'https://www.alpinestars.com/collections/sale-all',
    fetch: shopify({ base: 'https://www.alpinestars.com', collection: 'sale-all' }),
  },
  {
    id: 'louis',
    name: 'Louis',
    region: 'DE',
    currency: 'EUR',
    saleUrl: 'https://www.louis.de/katalog/restposten?categoryKey=ROOT&ipp=48&page=1&sort=recommendation&viewMode=grid',
    fetch: jsonld({ url: 'https://www.louis.de/katalog/restposten?categoryKey=ROOT&ipp=48&page=1&sort=recommendation&viewMode=grid' }),
  },
  {
    id: 'dainese',
    name: 'Dainese',
    region: 'DE',
    currency: 'EUR',
    saleUrl: 'https://www.dainese.com/de/de/outlet/',
    fetch: dainese({ site: 'Sites-dainese-row-Site', locale: 'de_DE', cgid: 'outlet' }),
  },
  {
    id: 'cyclegear',
    name: 'Cycle Gear',
    region: 'US',
    currency: 'USD',
    saleUrl: 'https://www.cyclegear.com/discount-depot-sale',
    fetch: jsonld({ url: 'https://www.cyclegear.com/discount-depot-sale' }),
  },
  {
    id: 'motorcyclegear',
    name: 'MotorcycleGear.com',
    region: 'US',
    currency: 'USD',
    saleUrl: 'https://motorcyclegear.com/collections/sale',
    fetch: shopify({ base: 'https://motorcyclegear.com', collection: 'sale' }),
  },
  {
    id: 'revit',
    name: "REV'IT! Outlet",
    region: 'EU',
    currency: 'EUR',
    saleUrl: 'https://revitsport.com/collections/revit-official-outlet',
    fetch: shopify({ base: 'https://revitsport.com', collection: 'revit-official-outlet' }),
  },
];
