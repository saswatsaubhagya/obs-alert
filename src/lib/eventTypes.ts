export type FieldType = 'string' | 'number';
export type Field = { name: string; type: FieldType; required: boolean };

export type Style = {
  accent: string;
  bg: string;
  fg: string;
  font: string;
  size: number;
  pos: string;
  width: number;
  radius: number;
  anim: 'fade' | 'slide' | 'pop';
};

export type ConfigDefaults = {
  template: string;
  titleTemplate: string;
  style: Style;
  durationMs: number;
};

export const BASE_STYLE: Style = {
  accent: '#7c5cff',
  bg: 'rgba(12,12,16,0.86)',
  fg: '#ffffff',
  font: 'system-ui, sans-serif',
  size: 34,
  pos: 'top',
  width: 640,
  radius: 16,
  anim: 'fade',
};

const s = (name: string, required = false): Field => ({ name, type: 'string', required });
const n = (name: string, required = false): Field => ({ name, type: 'number', required });

export const BUILT_IN: Record<string, { label: string; fields: Field[]; defaults: ConfigDefaults }> = {
  donation: {
    label: 'Donation',
    fields: [s('name', true), n('amount', true), s('currency'), s('message')],
    defaults: {
      template: '{name} donated {amount}!',
      titleTemplate: 'DONATION',
      style: { ...BASE_STYLE, accent: '#31d0aa' },
      durationMs: 6000,
    },
  },
  follow: {
    label: 'Follow',
    fields: [s('name', true), s('message')],
    defaults: {
      template: '{name} just followed!',
      titleTemplate: 'NEW FOLLOWER',
      style: { ...BASE_STYLE, accent: '#7c5cff' },
      durationMs: 4000,
    },
  },
  sub: {
    label: 'Subscription',
    fields: [s('name', true), n('months'), s('tier'), s('message')],
    defaults: {
      template: '{name} subscribed!',
      titleTemplate: 'SUBSCRIBER',
      style: { ...BASE_STYLE, accent: '#ffb020' },
      durationMs: 5000,
    },
  },
  raid: {
    label: 'Raid',
    fields: [s('name', true), n('viewers'), s('message')],
    defaults: {
      template: '{name} raided with {viewers} viewers!',
      titleTemplate: 'RAID',
      style: { ...BASE_STYLE, accent: '#ff5c8a' },
      durationMs: 5000,
    },
  },
};

export const EVENT_TYPE_KEYS = Object.keys(BUILT_IN);
