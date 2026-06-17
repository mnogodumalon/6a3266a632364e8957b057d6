import type { Bericht, Mangel } from './app';

export type EnrichedMangel = Mangel & {
  baustelleName: string;
};

export type EnrichedBericht = Bericht & {
  baustelleName: string;
};
