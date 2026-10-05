import { SearchQuery } from "@codemirror/search";
import type { Preferences } from "../preferences";

export type FindOptions = Pick<Preferences, "findMatchCase" | "findWholeWord">;

/** Change the text without dropping the options already chosen for this search. */
export function editFindQuery(query: SearchQuery, search: string, replace = query.replace): SearchQuery {
  return new SearchQuery({ ...query, search, replace, literal: true });
}

/** Preference changes also apply to a query while its find panel is closed. */
export function applyFindOptions(query: SearchQuery, options: Partial<FindOptions>): SearchQuery {
  return new SearchQuery({
    ...query,
    caseSensitive: options.findMatchCase ?? query.caseSensitive,
    wholeWord: options.findWholeWord ?? query.wholeWord,
    literal: true,
  });
}
