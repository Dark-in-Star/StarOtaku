"use server";

import { getAnimeList, getAnimeRelations, isRateLimited } from "./api";
import {
  BROAD_RELATION_TYPES,
  STRICT_RELATION_TYPES,
  findNewRelations,
  mergeSuggestions,
  selectScannableEntries,
  type ScanChunkResult,
  type ScanPlan,
  type ScanTarget,
} from "./sequels";
import type { AnimeNode, MyListEntryStatus } from "./types";

// One list entry = one detail request against a rate-limited API. MAL's edge starts
// throttling after a few hundred rapid requests (observed: ~250 at ~18 req/s), and the
// throttle applies to every MAL call this server makes — so an unpaced scan takes the whole
// app down with it. Entries are fetched one at a time, and a request that actually went to
// the network (a Data Cache hit returns in a few ms) is stretched to MIN_REQUEST_INTERVAL_MS,
// capping a cold scan at ~2 req/s while a warm re-scan stays instant.
const MIN_REQUEST_INTERVAL_MS = 500;
const CACHE_HIT_THRESHOLD_MS = 50;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Cheap first call: one list read that tells the client how much work there is. */
export async function planSequelScanAction(): Promise<ScanPlan> {
  const { data } = await getAnimeList();

  const statusById: Record<number, MyListEntryStatus> = {};
  for (const { node, list_status } of data) {
    if (list_status?.status) statusById[node.id] = list_status.status;
  }

  return {
    targets: selectScannableEntries(data).map(({ node }) => ({ id: node.id, title: node.title })),
    onList: data.map(({ node }) => node.id),
    statusById,
  };
}

/**
 * Scans one slice of the user's list. Called repeatedly by the client so results and
 * progress stream in rather than blocking on the whole list.
 */
export async function scanSequelChunkAction(
  targets: ScanTarget[],
  onList: number[],
  includeSideStories: boolean,
): Promise<ScanChunkResult> {
  const onListSet = new Set(onList);
  const allowed = includeSideStories ? BROAD_RELATION_TYPES : STRICT_RELATION_TYPES;

  let failed = 0;
  let rateLimited = false;
  const fetched: AnimeNode[] = [];

  for (const target of targets) {
    const startedAt = Date.now();
    try {
      fetched.push(await getAnimeRelations(target.id));
    } catch (error) {
      // Once throttled, every further request only extends the ban for the whole app.
      if (isRateLimited(error)) {
        rateLimited = true;
        break;
      }
      // A single unreachable title must not abort the whole scan.
      failed += 1;
    }

    const elapsed = Date.now() - startedAt;
    if (elapsed > CACHE_HIT_THRESHOLD_MS && elapsed < MIN_REQUEST_INTERVAL_MS) {
      await sleep(MIN_REQUEST_INTERVAL_MS - elapsed);
    }
  }

  const hits = fetched
    .map((node) => ({ source: node, found: findNewRelations(node, onListSet, allowed) }))
    .filter((hit) => hit.found.length > 0);

  return { suggestions: mergeSuggestions(hits), failed, rateLimited };
}
