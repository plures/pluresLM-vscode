/**
 * migration-utils.ts — pure helpers for embedding-dimension migration.
 *
 * Extracted from MemoryProvider so the same logic can be unit-tested in
 * isolation (migration.test.ts) without requiring a live SQLite database.
 */

export interface ProfileData {
  summary?: string;
  facts: string[];
  updated_at?: number;
  capture_count: number;
}

/**
 * Detect a dimension mismatch between the stored profile and the current
 * embedding provider.
 *
 * Returns a human-readable warning string if the dimensions differ, or `null`
 * if there is no stored dimension record or the dimensions match.
 */
export function detectDimensionMismatch(
  profile: ProfileData | null,
  currentDim: number
): string | null {
  if (!profile) return null;
  const stored = profile.facts.find((f) => f.startsWith('embedding_dimension:'));
  if (!stored) return null;
  const dim = parseInt(stored.split(':')[1], 10);
  return dim !== currentDim
    ? `Dimension mismatch: DB has ${dim}-dim embeddings, current provider uses ${currentDim}-dim. ` +
      `Recall quality may be degraded. Consider running "Memory: Index Project" to rebuild.`
    : null;
}

/**
 * Record the current embedding dimension in the profile's `facts` array.
 * No-op (returns the original object) if a dimension record already exists.
 */
export function recordDimension(profile: ProfileData, dim: number): ProfileData {
  const hasRecord = profile.facts.some((f) => f.startsWith('embedding_dimension:'));
  if (hasRecord) return profile;
  return { ...profile, facts: [...profile.facts, `embedding_dimension:${dim}`] };
}
