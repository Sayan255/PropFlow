import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateKeyPairPem } from '../keys.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const keysDir = path.resolve(__dirname, '../../../keys');

const { privateKeyPem, publicKeyPem } = generateKeyPairPem();
fs.mkdirSync(keysDir, { recursive: true });
fs.writeFileSync(path.join(keysDir, 'dev-private.pem'), privateKeyPem);
fs.writeFileSync(path.join(keysDir, 'dev-public.pem'), publicKeyPem);
fs.writeFileSync(path.join(keysDir, '.gitkeep'), '');
/* eslint-disable-next-line no-console */
console.log(`Wrote dev signing keys to ${keysDir}`);
