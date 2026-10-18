/** Loads an area pack from the static files under /whatif/<id>/ (no API calls). */
import { areaUrl } from './areas.ts';
import { PackError, buildGrid, parseAssets, parseManifest, sha256Hex, type AssetItem, type PackManifest } from './pack.ts';
import type { Grid } from './types.ts';

export interface LoadedPack {
  id: string;
  manifest: PackManifest;
  grid: Grid;
  assets: AssetItem[];
  /** 'verified' when the SHA-256 of every file matched the manifest; 'unavailable' when this browser context has no crypto.subtle. */
  integrity: 'verified' | 'unavailable';
}

type Fetch = (url: string) => Promise<Response>;

async function bytes(fetchFn: Fetch, id: string, file: string): Promise<ArrayBuffer> {
  let res: Response;
  try { res = await fetchFn(areaUrl(id, file)); } catch { throw new PackError('network', `${file} could not be fetched`); }
  if (!res.ok) throw new PackError('not_found', `${file} answered ${res.status}`);
  return res.arrayBuffer();
}

export async function loadPack(id: string, fetchFn: Fetch = url => fetch(url)): Promise<LoadedPack> {
  const mbuf = await bytes(fetchFn, id, 'manifest.json');
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder().decode(mbuf)); } catch { throw new PackError('bad_manifest', 'manifest.json is not valid JSON'); }
  const manifest = parseManifest(raw);
  const [elev, cover, assetBuf] = await Promise.all([bytes(fetchFn, id, 'elevation.i16'), bytes(fetchFn, id, 'landcover.u8'), bytes(fetchFn, id, 'assets.json')]);
  let integrity: LoadedPack['integrity'] = 'verified';
  for (const [name, buf] of [['elevation.i16', elev], ['landcover.u8', cover], ['assets.json', assetBuf]] as const) {
    const info = manifest.files.find(f => f.name === name)!;
    if (buf.byteLength !== info.bytes) throw new PackError('size_mismatch', `${name} has ${buf.byteLength} bytes, the manifest says ${info.bytes}`);
    const hex = await sha256Hex(buf);
    if (hex === null) integrity = 'unavailable';
    else if (hex !== info.sha256.toLowerCase()) throw new PackError('hash_mismatch', `${name} does not match the manifest checksum`);
  }
  let assetJson: unknown;
  try { assetJson = JSON.parse(new TextDecoder().decode(assetBuf)); } catch { throw new PackError('bad_assets', 'assets.json is not valid JSON'); }
  return { id, manifest, grid: buildGrid(manifest.layout, elev, cover), assets: parseAssets(assetJson, manifest.layout), integrity };
}
