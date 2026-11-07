/**
 * The compressed sidecars the build ships (#134): Home Assistant's static handler (aiohttp's) sends `name.br` or
 * `name.gz` in place of `name` to a browser that accepts it, so every text file of the build over 1 KB travels with
 * both, at the best levels. Written by `finish.mjs`, held to their files by `tools/release/check.mjs --release`, and
 * kept true by the integration at setup (`sweep_sidecars` in `custom_components/fluvy/frontend.py`, the same rule).
 */
import { promisify } from 'node:util';
import { brotliCompress, brotliDecompressSync, constants, gunzipSync, gzip } from 'node:zlib';

/** The suffixes of a file's sidecars. */
export const SIDECARS = ['.br', '.gz'];

/** Whether a file of the build, `bytes` long, travels compressed: text (scripts, styles, data, drawings) over 1 KB. */
export const travelsCompressed = (name, bytes) => /\.(js|css|json|svg)$/.test(name) && bytes > 1024;

/** Whether a file is a sidecar, by its name. */
export const isSidecar = (name) => SIDECARS.some((suffix) => name.endsWith(suffix));

const brotli = promisify(brotliCompress);
const gzipped = promisify(gzip);

/** A file's sidecars, by suffix: brotli's best for text, gzip's best (packed off the main thread, side by side). */
export async function pack(data) {
  const [br, gz] = await Promise.all([
    brotli(data, {
      params: {
        [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_TEXT,
        [constants.BROTLI_PARAM_QUALITY]: constants.BROTLI_MAX_QUALITY,
        [constants.BROTLI_PARAM_SIZE_HINT]: data.length,
      },
    }),
    gzipped(data, { level: constants.Z_BEST_COMPRESSION }),
  ]);
  return { '.br': br, '.gz': gz };
}

const UNPACK = { '.br': brotliDecompressSync, '.gz': gunzipSync };

/** Whether a sidecar's bytes unpack to exactly its file's (what does not unpack does not). */
export function holds(suffix, packed, data) {
  try {
    return UNPACK[suffix](packed).equals(data);
  } catch {
    return false;
  }
}
