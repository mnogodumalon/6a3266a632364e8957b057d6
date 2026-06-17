// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export type AttachmentType = 'file' | 'note' | 'url' | 'json';
export interface Attachment {
  id: string;
  type: AttachmentType;
  label: string | null;
  value: string | null;
  active: boolean;
  createdat?: string | null;
  updatedat?: string | null;
}

export interface AttachmentInput {
  type: AttachmentType;
  label?: string;
  value: string;
  active?: boolean;
}

export interface Mangel {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    titel?: string;
    beschreibung?: string;
    status?: LookupValue;
    frist?: string; // Format: YYYY-MM-DD oder ISO String
    foto?: string;
    baustelle?: string; // applookup -> URL zu 'Baustelle' Record
  };
}

export interface Bericht {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    titel?: string;
    datum?: string; // Format: YYYY-MM-DD oder ISO String
    dokument?: string;
    baustelle?: string; // applookup -> URL zu 'Baustelle' Record
  };
}

export interface Baustelle {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    name?: string;
    adresse?: string;
    bauleiter?: string;
    status?: LookupValue;
    titelfoto?: string;
  };
}

export const APP_IDS = {
  MANGEL: '6a32668ed3e88e64583b36b6',
  BERICHT: '6a32668ed559536a0f02fae1',
  BAUSTELLE: '6a326689292e299748fee5d3',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'mangel': {
    status: [{ key: "offen", label: "Offen" }, { key: "in_bearbeitung", label: "In Bearbeitung" }, { key: "behoben", label: "Behoben" }],
  },
  'baustelle': {
    status: [{ key: "in_planung", label: "In Planung" }, { key: "aktiv", label: "Aktiv" }, { key: "abgeschlossen", label: "Abgeschlossen" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'mangel': {
    'titel': 'string/text',
    'beschreibung': 'string/textarea',
    'status': 'lookup/select',
    'frist': 'date/date',
    'foto': 'file',
    'baustelle': 'applookup/select',
  },
  'bericht': {
    'titel': 'string/text',
    'datum': 'date/date',
    'dokument': 'file',
    'baustelle': 'applookup/select',
  },
  'baustelle': {
    'name': 'string/text',
    'adresse': 'string/text',
    'bauleiter': 'string/text',
    'status': 'lookup/select',
    'titelfoto': 'file',
  },
};

export const HUB_TOPOLOGY: Record<string, { field: string; entity: string }[]> = {
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateMangel = StripLookup<Mangel['fields']>;
export type CreateBericht = StripLookup<Bericht['fields']>;
export type CreateBaustelle = StripLookup<Baustelle['fields']>;