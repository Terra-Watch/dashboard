import { BadgeCheck, Camera, CheckCircle2, Flame, ClipboardCheck, ClipboardList, HardHat, Inbox, ListTodo, Map as MapIcon, Megaphone, MapPin, MessageSquareWarning, Plus, Radio, Satellite, ShieldCheck, User, Users, type LucideProps } from 'lucide-react';
import type { ComponentType } from 'react';
import type { IconId } from './nav';
import type { Rung } from './ladder';

const NAV_ICONS: Record<IconId, ComponentType<LucideProps>> = {
  'map-pin': MapPin, plus: Plus, 'clipboard-list': ClipboardList, users: Users, user: User, inbox: Inbox, map: MapIcon, radio: Radio,
  megaphone: Megaphone, 'clipboard-check': ClipboardCheck, 'list-todo': ListTodo, camera: Camera, flame: Flame,
};
const RUNG_ICONS = { satellite: Satellite, message: MessageSquareWarning, 'badge-check': BadgeCheck, 'hard-hat': HardHat, 'shield-check': ShieldCheck, 'circle-check': CheckCircle2 } as const;

export function NavIcon({ id, ...props }: { id: IconId } & LucideProps) {
  const Component = NAV_ICONS[id];
  return <Component aria-hidden="true" strokeWidth={1.75} size={22} {...props} />;
}
export function RungIcon({ id, ...props }: { id: keyof typeof RUNG_ICONS } & LucideProps) {
  const Component = RUNG_ICONS[id];
  return <Component aria-hidden="true" strokeWidth={1.75} size={16} {...props} />;
}
export type { Rung };
