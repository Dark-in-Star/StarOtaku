import type { AnimeNode, ListNode, MyListEntryStatus, MyListStatus, RelatedAnime } from "./types";

/**
 * List statuses worth scanning. Completed and watching are the obvious ones; plan_to_watch
 * is included so a franchise you've queued but not started still surfaces its later
 * entries — otherwise you'd add season 1, and the rest of the series stays invisible until
 * you begin watching.
 */
export const SCANNED_STATUSES = ["completed", "watching", "plan_to_watch"] as const;

/**
 * MAL relation types that represent "more of this story". `sequel` is the strict default;
 * the rest are opt-in because `alternative_version` and `summary` are usually re-tellings
 * of something the user already watched, not new material.
 */
export const STRICT_RELATION_TYPES = ["sequel"] as const;
export const BROAD_RELATION_TYPES = ["sequel", "side_story", "spin_off", "parent_story"] as const;

/** Relation types that are re-tellings — never suggested, even in broad mode. */
const NEVER_SUGGEST = new Set(["summary", "alternative_version", "alternative_setting", "character", "other"]);

export interface SequelSuggestion {
  node: AnimeNode;
  relationType: string;
  relationLabel: string;
  /** Titles already on the user's list that led here. */
  sources: { id: number; title: string }[];
}

export function normalizeRelationType(relationType: string): string {
  return relationType.toLowerCase().replace(/[\s-]+/g, "_");
}

/** The list entries a scan should walk, newest-finished first isn't needed — order is stable by id. */
export function selectScannableEntries(
  entries: ListNode<AnimeNode, MyListStatus>[],
): ListNode<AnimeNode, MyListStatus>[] {
  const wanted = new Set<string>(SCANNED_STATUSES);
  return entries.filter((entry) => entry.list_status?.status && wanted.has(entry.list_status.status));
}

/**
 * Picks relations of `source` that aren't already on the user's list.
 *
 * `onList` holds every id the user tracks under *any* status — including plan_to_watch and
 * dropped — so the scan never suggests something they've already made a decision about.
 */
export function findNewRelations(
  source: AnimeNode,
  onList: Set<number>,
  allowedTypes: readonly string[],
): { node: AnimeNode; relationType: string; relationLabel: string }[] {
  const allowed = new Set(allowedTypes);
  const related: RelatedAnime[] = source.related_anime ?? [];

  return related
    .filter((relation) => {
      const type = normalizeRelationType(relation.relation_type);
      if (NEVER_SUGGEST.has(type)) return false;
      if (!allowed.has(type)) return false;
      return !onList.has(relation.node.id);
    })
    .map((relation) => ({
      node: relation.node,
      relationType: normalizeRelationType(relation.relation_type),
      relationLabel: relation.relation_type_formatted || relation.relation_type,
    }));
}

/**
 * Collapses per-source hits into one entry per suggested anime, remembering every source
 * that pointed at it — a long franchise otherwise yields the same sequel many times over.
 */
export function mergeSuggestions(
  hits: { source: AnimeNode; found: { node: AnimeNode; relationType: string; relationLabel: string }[] }[],
): SequelSuggestion[] {
  const merged = new Map<number, SequelSuggestion>();

  for (const { source, found } of hits) {
    for (const item of found) {
      const existing = merged.get(item.node.id);
      if (existing) {
        if (!existing.sources.some((s) => s.id === source.id)) {
          existing.sources.push({ id: source.id, title: source.title });
        }
        continue;
      }
      merged.set(item.node.id, {
        node: item.node,
        relationType: item.relationType,
        relationLabel: item.relationLabel,
        sources: [{ id: source.id, title: source.title }],
      });
    }
  }

  // Most-connected first: something several watched titles point at is the strongest pick.
  return [...merged.values()].sort(
    (a, b) => b.sources.length - a.sources.length || a.node.title.localeCompare(b.node.title),
  );
}

/**
 * Folds a newly-arrived chunk of suggestions into those already collected. A scan streams
 * in batches, so the same sequel can surface from sources in different chunks — this keeps
 * one card per anime, unions their sources, and re-applies the most-referenced-first order.
 */
export function accumulateSuggestions(
  previous: SequelSuggestion[],
  incoming: SequelSuggestion[],
): SequelSuggestion[] {
  const merged = new Map<number, SequelSuggestion>();

  for (const suggestion of [...previous, ...incoming]) {
    const existing = merged.get(suggestion.node.id);
    if (!existing) {
      merged.set(suggestion.node.id, { ...suggestion, sources: [...suggestion.sources] });
      continue;
    }
    for (const source of suggestion.sources) {
      if (!existing.sources.some((s) => s.id === source.id)) existing.sources.push(source);
    }
  }

  return [...merged.values()].sort(
    (a, b) => b.sources.length - a.sources.length || a.node.title.localeCompare(b.node.title),
  );
}

/**
 * Entries scanned per action call — the client walks the list in pages to stream progress.
 * Kept small because each call holds the client's single Server Action slot; anything else
 * the user triggers meanwhile waits for the in-flight batch (up to ~5s when paced).
 */
export const SCAN_BATCH_SIZE = 10;

export interface ScanTarget {
  id: number;
  title: string;
}

export interface ScanPlan {
  targets: ScanTarget[];
  /** Every id on the user's list under any status — suggestions are filtered against this. */
  onList: number[];
  /**
   * The visitor's actual status per tracked id, so a card can show what that status *is*
   * rather than just that the title is tracked.
   */
  statusById: Record<number, MyListEntryStatus>;
}

export interface ScanChunkResult {
  suggestions: SequelSuggestion[];
  /** Entries that errored — surfaced so a partial scan never silently under-reports. */
  failed: number;
  /** MAL started throttling mid-chunk; the rest of the chunk was skipped. */
  rateLimited: boolean;
}
