export type Iso3 = string;
export type YearSeries = Record<string, number>;
export type CountrySeries = Record<Iso3, YearSeries>;

export interface Country {
  iso3: Iso3;
  name: string;
  short: string;
  m49: number;
}

export interface Pillar {
  id: string;
  label: string;
  short: string;
}

export type Polarity = 'higher' | 'lower' | 'neutral';
export type AggMethod = 'gdp' | 'pop' | 'sum' | 'none';

export interface IndicatorMeta {
  id: string;
  source: 'wb' | 'imf' | 'sdg' | 'hdro' | 'ilo' | 'derived';
  dims?: Record<string, string>;
  code: string;
  pillar?: string;
  label: string;
  unit: string;
  unitShort?: string;
  decimals: number;
  polarity?: Polarity;
  agg?: AggMethod;
  description?: string;
  sourceName: string;
  sourceUrl: string;
  caveat?: string;
  projections?: boolean;
  hidden?: boolean;
}

export interface MpiRow {
  survey: string;
  year: string;
  mpi: number;
  headcount: number;
  intensity: number;
  vulnerable: number;
  severe: number;
  health: number;
  education: number;
  living: number;
}

export interface IncomeRow {
  group: 'LIC' | 'LMC' | 'UMC' | 'HIC';
  lending: string | null;
  changed: boolean;
  previous?: string;
}

export interface Dataset {
  meta: {
    title: string;
    generatedAt: string;
    testFixture?: boolean;
    status: { id: string; ok: boolean; observations?: number; error?: string; keptPrevious?: boolean; derived?: boolean }[];
    checks: { id: string; iso3: string; year: number; value: number; tolerance: number; got: number | null; ok: boolean }[];
    links?: { url: string; status: number; ok: boolean; error?: string }[];
    countries: Country[];
    pillars: Pillar[];
  };
  catalogue: IndicatorMeta[];
  indicators: Record<string, { values: CountrySeries; apiLabel?: string | null; stale?: boolean }>;
  static: {
    mpi: { source: string; sourceUrl: string; tableUrl: string; note: string; notCovered: string[]; rows: Record<Iso3, MpiRow> };
    income: { source: string; sourceUrl: string; thresholds: Record<string, string>; groups: Record<string, string>; rows: Record<Iso3, IncomeRow> };
    irena?: { source: string; sourceUrl: string; note: string; year: number; rows: Record<Iso3, { jobs: number; technology: string }> };
  };
}
