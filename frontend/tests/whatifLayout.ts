import { cellCentre, type Layout } from '../src/features/scenarios/whatif/layout';
import { parseManifest } from '../src/features/scenarios/whatif/pack';

export { cellCentre };
/** The pack's layout, parsed with the page's own code. */
export const parseManifestLayout = (raw: unknown): Layout => parseManifest(raw).layout;
