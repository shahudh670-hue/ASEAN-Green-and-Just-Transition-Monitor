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
    mpi2026?: Mpi2026;
    subregional?: { note: string; frameworks: Framework[] };
    povrefs?: Record<string, { name: string; url: string; facts?: string }>;
  };
}

export const MPI_INDICATORS = ['nutrition', 'child_mortality', 'schooling', 'attendance', 'cooking', 'sanitation', 'water', 'electricity', 'housing', 'assets'] as const;
export type MpiIndicator = (typeof MPI_INDICATORS)[number];
export type MpiProfile = Record<MpiIndicator, number | null>;

export interface MpiNational {
  survey: string;
  year: string;
  mpi: number;
  headcount: number;
  intensity: number;
  vulnerable: number;
  severe: number;
  destitute: number | null;
  popSurvey: number;
  pop2024: number;
  poorSurvey: number;
  poor2024: number;
  nIndicators: number;
  missing: string;
  censored: MpiProfile;
  raw: MpiProfile;
  contrib: MpiProfile;
  contribDims: { health: number; education: number; living: number };
}

export interface MpiRegion {
  iso: Iso3;
  name: string;
  year: string;
  mpi: number;
  headcount: number;
  intensity: number;
  vulnerable: number;
  severe: number;
  popShare: number;
  pop2024: number;
  poor2024: number;
  censored: MpiProfile;
  raw: MpiProfile;
  contrib: MpiProfile;
  contribDims: { health: number; education: number; living: number };
}

export interface ChangeBlock {
  t0: number | null;
  t1: number | null;
  abs: number | null;
  rel: number | null;
  sig: string;
}

export interface MpiChange {
  iso: Iso3;
  survey0: string;
  year0: string;
  survey1: string;
  year1: string;
  mpi: ChangeBlock;
  headcount: ChangeBlock;
  intensity: ChangeBlock;
  vulnerable: ChangeBlock;
  severe: ChangeBlock;
  poor0: number;
  poor1: number;
  censored: Record<MpiIndicator, ChangeBlock>;
  nIndicators: number;
  missing: string;
}

export interface Mpi2026 {
  title: string;
  publisher: string;
  licence: string;
  pageUrl: string;
  hdroUrl: string;
  citations: { national: string; regions: string; changes: string };
  units: string;
  notCovered: Iso3[];
  national: Record<Iso3, MpiNational>;
  regions: MpiRegion[];
  changes: MpiChange[];
}

export interface Framework {
  id: string;
  name: string;
  short: string;
  members: string;
  sourceName: string;
  sourceUrl: string;
  regions: Record<string, 'full' | 'partial'>;
  partialNote: string;
}
