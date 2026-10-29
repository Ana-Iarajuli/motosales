// Writes public/config.json — the browser's account settings — from environment variables.
// Both values are public by design (the publishable key only allows what database policies permit).
// Run by `npm run build`; the local server answers /config.json directly instead.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const publicConfig = () => ({
  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY || '',
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'config.json');
  const cfg = publicConfig();
  fs.writeFileSync(file, JSON.stringify(cfg));
  console.log(cfg.supabaseUrl ? `config.json written (${cfg.supabaseUrl})` : 'config.json written — SUPABASE_URL not set, accounts are disabled');
}
