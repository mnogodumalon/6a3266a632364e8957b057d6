import type { EnrichedBericht, EnrichedMangel } from '@/types/enriched';
import type { Baustelle, Bericht, Mangel } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface MangelMaps {
  baustelleMap: Map<string, Baustelle>;
}

export function enrichMangel(
  mangel: Mangel[],
  maps: MangelMaps
): EnrichedMangel[] {
  return mangel.map(r => ({
    ...r,
    baustelleName: resolveDisplay(r.fields.baustelle, maps.baustelleMap, 'name'),
  }));
}

interface BerichtMaps {
  baustelleMap: Map<string, Baustelle>;
}

export function enrichBericht(
  bericht: Bericht[],
  maps: BerichtMaps
): EnrichedBericht[] {
  return bericht.map(r => ({
    ...r,
    baustelleName: resolveDisplay(r.fields.baustelle, maps.baustelleMap, 'name'),
  }));
}
