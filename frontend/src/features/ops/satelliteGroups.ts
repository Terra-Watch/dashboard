/** Quality groups of satellite detections (docs/22): the pure helpers the satellite pages share. A detection without a group is shown as ungrouped, never hidden. */
export type Group = 'likely' | 'unconfirmed' | 'known_source' | 'outside_forest';
export type GroupId = Group | 'ungrouped';
export const GROUP_ORDER: readonly GroupId[] = ['likely', 'unconfirmed', 'ungrouped', 'known_source', 'outside_forest'];
/** On by default: what an operator should look at. The known sources and detections outside forest are counted, one tap away. */
export const DEFAULT_ON: ReadonlySet<GroupId> = new Set<GroupId>(['likely', 'unconfirmed', 'ungrouped']);

export type Graded = { quality_group?: Group | null; quality_p?: number | null; quality_reasons?: string[] | null };
type T = (key: string, fallback: string) => string;

export const groupOf = (i: Graded): GroupId => i.quality_group ?? 'ungrouped';

export function groupName(g: GroupId, t: T): string {
  return g === 'likely' ? t('sat.group_likely', 'Likely fire') : g === 'unconfirmed' ? t('sat.group_unconfirmed', 'Unconfirmed') : g === 'known_source' ? t('sat.group_known', 'Known heat source')
    : g === 'outside_forest' ? t('sat.group_outside', 'Outside forest') : t('sat.group_ungrouped', 'Not sorted');
}

export function groupHelp(g: GroupId, t: T): string {
  return g === 'likely' ? t('sat.help_likely', 'Inside forest, with signs of a real fire. Check it.')
    : g === 'unconfirmed' ? t('sat.help_unconfirmed', 'Inside forest but weak or alone. It is checked again on the next satellite pass.')
    : g === 'known_source' ? t('sat.help_known', 'Next to a mine, kiln or plant, or a spot that keeps showing heat outside the fire season.')
    : g === 'outside_forest' ? t('sat.help_outside', 'Mostly outside forest land, for example farm burning.') : t('sat.help_ungrouped', 'The quality check has not sorted this one yet.');
}

const REASONS: Record<string, [string, string]> = {
  industrial_near: ['sat.r_industrial', 'within 1 km of a mine, kiln, plant or similar'], persistent_source: ['sat.r_persistent', 'this spot keeps showing heat outside the fire season'],
  outside_forest: ['sat.r_outside', 'less than half of the spot is forest land'], isolated_weak: ['sat.r_weak', 'alone and weak, with no signs of a growing fire'],
  seen_again: ['sat.r_again', 'seen again on a later satellite pass'], not_scored: ['sat.r_unscored', 'could not be scored, so it is kept in view'],
};
export const reasonWords = (reasons: string[] | null | undefined, t: T): string[] => (reasons ?? []).map(r => REASONS[r] ? t(REASONS[r][0], REASONS[r][1]) : r);

export function groupCounts(items: Graded[]): Record<GroupId, number> {
  const out: Record<GroupId, number> = { likely: 0, unconfirmed: 0, ungrouped: 0, known_source: 0, outside_forest: 0 };
  for (const i of items) out[groupOf(i)] += 1;
  return out;
}

export const visible = <T extends Graded>(items: T[], on: ReadonlySet<GroupId>): T[] => items.filter(i => on.has(groupOf(i)));

/** Map symbol: solid for likely, the dashed outline for everything that needs a second look, grey squares for known sources and outside forest. */
export const symbolOfGroup = (g: GroupId): 'signal_likely' | 'signal' | 'signal_source' => (g === 'likely' ? 'signal_likely' : g === 'known_source' || g === 'outside_forest' ? 'signal_source' : 'signal');

/** Sort order for lists: likely first, then unconfirmed, then the rest; newest first inside a group (items come newest first already). */
export const byGroup = <T extends Graded>(items: T[]): T[] => [...items].sort((a, b) => GROUP_ORDER.indexOf(groupOf(a)) - GROUP_ORDER.indexOf(groupOf(b)));
