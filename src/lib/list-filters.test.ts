import { describe, expect, it } from "vitest";
import { DEFAULT_LIST_FILTERS, countActiveFilters, matchesListFilters } from "./list-filters";

describe("airing status filter", () => {
  const filters = { ...DEFAULT_LIST_FILTERS, airingStatuses: ["finished_airing", "not_yet_aired"] };

  it("keeps nodes whose status is one of the selected statuses", () => {
    expect(matchesListFilters({ status: "finished_airing" }, filters)).toBe(true);
    expect(matchesListFilters({ status: "not_yet_aired" }, filters)).toBe(true);
  });

  it("drops nodes with an unselected or missing status", () => {
    expect(matchesListFilters({ status: "currently_airing" }, filters)).toBe(false);
    expect(matchesListFilters({}, filters)).toBe(false);
  });

  it("matches everything when no status is selected", () => {
    expect(matchesListFilters({ status: "currently_airing" }, DEFAULT_LIST_FILTERS)).toBe(true);
  });

  it("counts as one active filter", () => {
    expect(countActiveFilters(filters)).toBe(1);
  });
});
