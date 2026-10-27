// Turns raw store items into one consistent product shape.

const NAMED_ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', euro: '€', reg: '®', trade: '™', copy: '©' };

export function decodeEntities(s = '') {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED_ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(html = '') {
  return decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

export function parsePrice(s) {
  if (s == null) return null;
  if (typeof s === 'number') return s;
  const n = parseFloat(String(s).replace(/[^\d.,]/g, '').replace(/,(?=\d{3}\b)/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** "SMART GO - AIRBAG-MOTORRADWESTE" -> "Smart Go - Airbag-Motorradweste" (only for all-caps names). */
export function tidyTitle(s) {
  s = s.replace(/\s+/g, ' ').trim();
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
}

const canon = (s) => s.toLowerCase().replace(/['’`]/g, '').replace(/[^a-z0-9]+/g, '');

// canonical key -> display name. Also used to spot brands at the start of titles.
const BRANDS = [
  "REV'IT!", 'Alpinestars', 'Dainese', 'AGV', 'Shoei', 'Arai', 'HJC', 'Shark', 'Bell', 'Scorpion', 'Schuberth',
  'Nolan', 'X-Lite', 'Caberg', 'LS2', 'Airoh', 'MT Helmets', 'Nexx', 'Icon', 'Klim', 'Held', 'Rukka', 'Furygan',
  'Ixon', 'Richa', 'Macna', 'Spidi', 'Sidi', 'TCX', 'Forma', 'Gaerne', 'Fox', 'Leatt', 'Troy Lee Designs',
  "O'Neal", 'Fly Racing', 'Thor', 'Acerbis', 'FC-Moto', 'Bering', 'Segura', 'Modeka', 'Büse', 'IXS', 'Stylmartin',
  'Helstons', 'Segura', 'Knox', 'Forcefield', 'Cardo', 'Sena', 'Kriega', 'SW-Motech', 'Givi', 'Oxford', 'Oneal',
  'Cortech', 'Joe Rocket', 'Tourmaster', 'Speed and Strength', 'Highway 21', 'Biltwell', 'Roland Sands Design',
  'Merlin', 'Pando Moto', 'Saint', 'Resurgence', 'Rokker', 'John Doe', 'Held', 'Vanucci', 'Probiker', 'Nishua',
  'Lazer', 'Suomy', 'Simpson', 'Premier', 'Kabuto', 'Ruroc', 'Daytona', 'Falco', 'Stylmartin', 'Kenny', 'Shot',
  '100%', 'Oakley', 'Scott', 'EVS', 'Atlas', 'Seven', 'Moose Racing', 'Answer', 'Kini Red Bull', 'Bohn', 'Pinlock',
  'Dririder', 'Halvarssons', 'Lindstrands', 'Mohawk', 'Trilobite', 'Ugly Bros', 'Motoairbag', 'In&motion',
];
const BRAND_BY_CANON = new Map(BRANDS.map((b) => [canon(b), b]));
const BRAND_ALIASES = {
  revit: "REV'IT!",
  revitsportinternational: "REV'IT!",
  revitsport: "REV'IT!",
  revitproduction: "REV'IT!",
  alpinestarsus: 'Alpinestars',
  scorpionexo: 'Scorpion',
  oneal: "O'Neal",
  mt: 'MT Helmets',
  ixs: 'IXS',
};
for (const [k, v] of Object.entries(BRAND_ALIASES)) BRAND_BY_CANON.set(k, v);

export function normalizeBrand(raw) {
  if (!raw) return null;
  const c = canon(raw);
  return BRAND_BY_CANON.get(c) ?? raw.trim().replace(/\s+/g, ' ');
}

/** Finds the brand a title starts with ("Alpinestars T-SP 5 ..."), longest match first. */
export function brandFromTitle(title) {
  const words = title.split(/\s+/);
  for (let n = Math.min(4, words.length - 1); n >= 1; n--) {
    const b = BRAND_BY_CANON.get(canon(words.slice(0, n).join(' ')));
    if (b) return b;
  }
  return null;
}

// Order matters: the first rule that matches wins.
const CATEGORY_RULES = [
  ['Bags & Luggage', /\b(bag|backpack|rucksack|tasche|luggage|tank ?bag|saddlebag|duffle|hip ?pack)/],
  ['Protection', /\b(airbag|tech-air|d-air|smart ?jacket|smart go|armou?r|protector|protektor|back ?protect|chest ?protect|knee ?guard|elbow|neck ?brace|roost|body ?guard|protection|protektoren|impact shorts?)/],
  ['Helmets', /\b(helmet|helm|visor|visier|pinlock|full[- ]face|modular)\b/],
  ['Gloves', /\b(glove|handschuh|gauntlet)/],
  ['Boots & Shoes', /\b(boot|stiefel|shoe|schuh|sneaker|riding shoe)/],
  ['Suits', /\b(suit|kombi|one[- ]piece|1pc|2pc|race ?suit|leathers)\b/],
  ['Pants', /\b(pant|trouser|jean|hose|chaps|overpant|legging|short)/],
  ['Jackets & Vests', /\b(jacket|jacke|vest|weste|parka|coat|hoodie jacket|anorak)/],
  ['Base Layers', /\b(base ?layer|underwear|thermal|undershirt|funktions|compression|balaclava|neck ?warmer|tube|headwear|sock)/],
  ['Casual Wear', /\b(t-shirt|tee|hoodie|sweatshirt|sweater|shirt|hat|cap|beanie|polo|jersey|fleece|pullover|zip)/],
];

export function classify(text) {
  const t = ` ${text.toLowerCase()} `;
  for (const [cat, re] of CATEGORY_RULES) if (re.test(t)) return cat;
  return 'Accessories';
}

export function detectGender(text) {
  const t = ` ${text.toLowerCase()} `;
  if (/\b(youth|kids?|junior|boys?|girls?|child)\b/.test(t)) return 'Kids';
  if (/\b(women'?s?|womens|woman|lady|ladies|damen|female|wmn)\b/.test(t)) return 'Women';
  if (/\b(men'?s?|mens|man|herren|male)\b/.test(t)) return 'Men';
  return 'Unisex';
}

const LETTER_SIZE = /^(XXS|XS|S|M|L|XL|XXL|XXXL|XXXXL|[2-5]XL|2XS)$/;
const SIZE_ALIASES = { XXL: '2XL', XXXL: '3XL', XXXXL: '4XL', XXS: '2XS' };

/** Normalized letter sizes for filtering (EU/US numeric sizes are kept raw on the product page). */
export function normalizeSizes(sizes) {
  const out = new Set();
  for (const s of sizes) {
    const u = String(s).toUpperCase().replace(/\(.*?\)/g, '').replace(/\s+/g, '').trim();
    if (LETTER_SIZE.test(u)) out.add(SIZE_ALIASES[u] ?? u);
  }
  return [...out];
}

const MATCH_STOPWORDS = new Set(
  (
    'mens men womens women woman lady ladies kids youth herren damen motorcycle motorrad the and with for ' +
    'black white red blue green grey gray yellow orange navy fluo fluorescent matt matte gloss silver gold brown ' +
    'beige camo pink purple anthracite dark light schwarz weiss weis rot blau gelb grun sand olive khaki burgundy ' +
    'neon cobalt petrol titanium ice ' +
    // store-specific filler and words already implied by the category
    'motocross mx offroad road street textile leather waterproof wp rain regenjacke regenhose ' +
    'jacket jackets jacke pants pant trousers hose jeans gloves glove handschuhe boots boot helmet helm ' +
    'regular standard sf bf tall fit used'
  ).split(' '),
);

/**
 * Key used to find the same product at different stores. Stores word titles differently
 * ("Jacket Arbor H2O | Black" vs "Revit Arbor H2O Motorcycle Textile Jacket"), so it is the
 * sorted set of model words plus brand, category and gender. Text after "|" or "~" is
 * colorway / stock notes and is ignored.
 */
export function matchKey(brand, title, category, gender) {
  const brandTokens = new Set((brand || '').toLowerCase().replace(/['’`!]/g, '').split(/[^a-z0-9]+/));
  const tokens = new Set(
    title
      .split(/[|~]/)[0]
      .toLowerCase()
      .replace(/['’`!®™]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((w) => w && !brandTokens.has(w) && !MATCH_STOPWORDS.has(w)),
  );
  return [canon(brand || 'unknown'), canon(category), gender, [...tokens].sort().join('-')].join(':');
}
