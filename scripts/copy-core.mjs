// El runtime de pthreads de mGBA arranca su worker desde la URL de mgba.js, asi que
// tanto el script como el .wasm deben servirse como archivos estaticos del mismo origen.
// Por eso los copiamos a public/core/ en vez de dejar que los procese el bundler.
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const from = resolve(root, 'node_modules/@thenick775/mgba-wasm/dist');
const to = resolve(root, 'public/core');

await mkdir(to, { recursive: true });
for (const file of ['mgba.js', 'mgba.wasm']) {
  await copyFile(resolve(from, file), resolve(to, file));
}
console.log('core mGBA copiado a public/core/');
