/**
 * Which spool a run should take, proposed when the job starts (decision of
 * the owner: rolls are confirmed on «Iniciar», not when queueing).
 *
 * The roll already on the printer first, then an open one, then a sealed
 * one. Picking "the one with most grams" proposed the sealed kilo on the
 * shelf over the open roll in the AMS, and the close then discounted the
 * wrong roll without anybody noticing (barrido, ronda 2, producción).
 */

export type SpoolStatus = 'in_use' | 'open' | 'sealed';

export interface SpoolChoice {
  id: string;
  skuId: string;
  status: SpoolStatus;
  onHandG: number;
}

const STATUS_RANK: Record<SpoolStatus, number> = { in_use: 0, open: 1, sealed: 2 };

/**
 * Among rolls in the same state, one that is enough wins, and of those the
 * one with less left, so started rolls get finished instead of piling up.
 * When none is enough, the fullest one runs out last.
 */
function compareSpools(grams: number) {
  return (a: SpoolChoice, b: SpoolChoice): number => {
    const byStatus = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (byStatus !== 0) return byStatus;
    const aEnough = a.onHandG >= grams;
    const bEnough = b.onHandG >= grams;
    if (aEnough !== bEnough) return aEnough ? -1 : 1;
    return aEnough ? a.onHandG - b.onHandG : b.onHandG - a.onHandG;
  };
}

/** The proposed roll for a filament, skipping the ones already chosen for this job. Empty when there is none. */
export function suggestSpool(
  spools: readonly SpoolChoice[],
  skuId: string | null,
  grams: number,
  taken: ReadonlySet<string> = new Set(),
): string {
  if (!skuId) return '';
  const candidates = spools.filter((spool) => spool.skuId === skuId && !taken.has(spool.id));
  return [...candidates].sort(compareSpools(grams))[0]?.id ?? '';
}

export interface PlateUse {
  slot: number;
  skuId: string | null;
  grams: number;
}

/**
 * One row per filament of the plate. Two slots of the same filament become
 * one row with their grams added: a job can name each roll only once, and
 * the AMS feeding both slots from rolls of one colour is still one colour to
 * discount.
 */
export function rowsForPlate(uses: readonly PlateUse[]): PlateUse[] {
  const rows: PlateUse[] = [];
  for (const use of [...uses].sort((a, b) => a.slot - b.slot)) {
    const same = use.skuId === null ? undefined : rows.find((row) => row.skuId === use.skuId);
    if (same) same.grams = Math.round((same.grams + use.grams) * 100) / 100;
    else rows.push({ ...use });
  }
  return rows;
}
