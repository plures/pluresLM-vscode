/**
 * Auto-capture and recall heuristics for agent mode.
 *
 * Filters out noise (generated files, rapid re-saves, trivial content) and
 * ensures recalled memories meet a minimum relevance threshold.
 */

/** Patterns for files that should never be auto-captured. */
const SKIP_PATTERNS: RegExp[] = [
  /(?:^|[\\/])node_modules[\\/]/,
  /(?:^|[\\/])\.git[\\/]/,
  /(?:^|[\\/])dist[\\/]/,
  /(?:^|[\\/])build[\\/]/,
  /(?:^|[\\/])out[\\/]/,
  /(?:^|[\\/])\.next[\\/]/,
  /(?:^|[\\/])\.venv[\\/]/,
  /(?:^|[\\/])__pycache__[\\/]/,
  /(?:^|[\\/])coverage[\\/]/,
  /(?:^|[\\/])\.nyc_output[\\/]/,
  /(?:^|[\\/])\.env(\..+)?$/,
  /\.(pem|key|p12|pfx|jks|keystore)$/,
  /(?:^|[\\/])id_rsa$/,
  /(?:^|[\\/])\.npmrc$/,
  /\.lock$/,
  /\.min\.(js|css)$/,
  /\.map$/,
  /\.d\.ts$/,
  /\.generated\.\w+$/,
  /\.snap$/,
  /\.svg$/,
  /\.png$/,
  /\.jpg$/,
  /\.jpeg$/,
  /\.gif$/,
  /\.webp$/,
  /\.ico$/,
  /\.woff2?$/,
  /\.ttf$/,
  /\.eot$/,
  /\.pdf$/,
  /\.zip$/,
  /\.tar$/,
  /\.gz$/,
  /\.bin$/,
  /\.exe$/,
  /package-lock\.json$/,
  /yarn\.lock$/,
  /pnpm-lock\.yaml$/,
];

/** Default minimum content length (characters) to consider a save worth capturing. */
export const DEFAULT_MIN_CONTENT_LENGTH = 50;

/** Default cooldown in milliseconds between captures for the same file path. */
export const DEFAULT_CAPTURE_COOLDOWN_MS = 30_000;

/** Default minimum similarity score for recalled memories in agent mode. */
export const DEFAULT_MIN_RECALL_SCORE = 0.5;

/** Maximum number of recall results surfaced to the agent. */
export const DEFAULT_MAX_RECALL_RESULTS = 5;

/**
 * Returns `true` if the file path should be skipped for auto-capture.
 */
export function shouldSkipFile(relativePath: string): boolean {
  return SKIP_PATTERNS.some((re) => re.test(relativePath));
}

/**
 * Returns `true` if the document content is too short / trivial to capture.
 */
export function isContentTrivial(text: string, minLength: number = DEFAULT_MIN_CONTENT_LENGTH): boolean {
  // Strip leading/trailing whitespace and count meaningful characters
  const trimmed = text.trim();
  return trimmed.length < minLength;
}

/**
 * Simple per-file cooldown tracker.
 *
 * Prevents storing a new memory for the same file path within `cooldownMs`.
 */
export class CaptureCooldown {
  private lastCapture = new Map<string, number>();

  constructor(private cooldownMs: number = DEFAULT_CAPTURE_COOLDOWN_MS) {}

  /**
   * Returns `true` if enough time has passed since the last capture for this path.
   * Automatically records the current timestamp when returning `true`.
   */
  tryAcquire(filePath: string, now: number = Date.now()): boolean {
    const last = this.lastCapture.get(filePath);
    if (last !== undefined && now - last < this.cooldownMs) {
      return false;
    }
    this.lastCapture.set(filePath, now);
    return true;
  }

  /** Reset the cooldown tracker (e.g. on config change). */
  clear(): void {
    this.lastCapture.clear();
  }
}

/**
 * Filter recalled memories by a minimum relevance score so that only
 * genuinely useful results are surfaced to the agent.
 */
export function filterByRelevance<T extends { score: number }>(
  results: T[],
  minScore: number = DEFAULT_MIN_RECALL_SCORE,
  maxResults: number = DEFAULT_MAX_RECALL_RESULTS,
): T[] {
  return results.filter((r) => r.score >= minScore).slice(0, maxResults);
}
