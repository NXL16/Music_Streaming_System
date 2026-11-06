"use client";

import type { Dispatch, RefObject, SetStateAction } from "react";
import type { MediaCardProps } from "@/components/media/media-card.types";
import { SearchMediaSuggestionLockup } from "./search-media-suggestion-lockup";

export type SearchSuggestion =
  | { kind: "query"; value: string }
  | { kind: "media"; card: MediaCardProps };

type SearchWrapperProps = {
  activeIndex: number;
  inputRef: RefObject<HTMLInputElement | null>;
  isLoading: boolean;
  isOpen: boolean;
  onEscape: () => void;
  onCancel: () => void;
  onFocus: () => void;
  onQueryChange: (query: string) => void;
  onSelect: (suggestion: SearchSuggestion) => void;
  onSubmit: () => void;
  query: string;
  rootRef: RefObject<HTMLDivElement | null>;
  setActiveIndex: Dispatch<SetStateAction<number>>;
  showCancel: boolean;
  suggestions: SearchSuggestion[];
  trimmedQuery: string;
};

function SearchIcon({ className }: { className: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className={className}
      aria-hidden="true"
    >
      <path d="M11.87 10.835q.027.022.051.047l3.864 3.863a.735.735 0 1 1-1.04 1.04l-3.863-3.864-.047-.051a6.667 6.667 0 1 1 1.035-1.035M6.667 12a5.333 5.333 0 1 0 0-10.667 5.333 5.333 0 0 0 0 10.667" />
    </svg>
  );
}

function SearchHintText({ value, query }: { value: string; query: string }) {
  const matchStart = value
    .toLocaleLowerCase()
    .indexOf(query.toLocaleLowerCase());
  const matchEnd = matchStart + query.length;
  if (matchStart < 0) return <>{value}</>;
  return (
    <>
      {value.slice(0, matchStart)}
      <span className="highlighted">{value.slice(matchStart, matchEnd)}</span>
      {value.slice(matchEnd)}
    </>
  );
}

export function SearchWrapper({
  activeIndex,
  inputRef,
  isLoading,
  isOpen,
  onEscape,
  onCancel,
  onFocus,
  onQueryChange,
  onSelect,
  onSubmit,
  query,
  rootRef,
  setActiveIndex,
  showCancel,
  suggestions,
  trimmedQuery,
}: SearchWrapperProps) {
  return (
    <div className="search-input-wrapper">
      <div
        ref={rootRef}
        aria-controls="search-suggestions"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-owns="search-suggestions"
        aria-activedescendant={
          activeIndex >= 0 ? "search-suggestion-" + activeIndex : undefined
        }
        className="search-input-container"
        tabIndex={-1}
        role="combobox"
      >
        <div className="flex-container">
          <form
            id="search-input-form"
            className="search-input__form"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit();
            }}
          >
            <SearchIcon className="search-svg" />
            {!query && (
              <label
                htmlFor="search-input__text-field"
                aria-hidden
                className="search-input__label"
              >
                Search
              </label>
            )}
            <input
              ref={inputRef}
              aria-autocomplete="list"
              aria-multiline="false"
              aria-controls="search-suggestions"
              spellCheck="false"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              type="search"
              inputMode="search"
              tabIndex={-1}
              id="search-input__text-field"
              className="search-input__text-field"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onFocus={onFocus}
              onKeyDown={(event) => {
                if (event.key === "Escape") return onEscape();
                if (!suggestions.length) return;
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((current) =>
                    current >= suggestions.length - 1 ? 0 : current + 1,
                  );
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((current) =>
                    current <= 0 ? suggestions.length - 1 : current - 1,
                  );
                }
              }}
            />
          </form>

          {showCancel && (
            <div className="search-input__cancel-button-container">
              <button aria-label="Cancel" onClick={onCancel} type="button">
                Cancel
              </button>
            </div>
          )}
        </div>
        <div />
        {isOpen && (
          <ul
            aria-label="Suggestions"
            aria-busy={isLoading}
            role="listbox"
            id="search-suggestions"
            className="search-suggestions"
          >
            {suggestions.map((suggestion, index) =>
              suggestion.kind === "query" ? (
                <li
                  key={"query-" + suggestion.value}
                  className="search-hint search-hint--text"
                  data-index={index}
                  role="option"
                  aria-selected={activeIndex === index}
                  tabIndex={-1}
                  id={"search-suggestion-" + index}
                  onClick={() => onSelect(suggestion)}
                >
                  <SearchIcon className="search-suggestion-svg" />
                  <span className="suggestion">
                    <SearchHintText
                      value={suggestion.value}
                      query={trimmedQuery}
                    />
                  </span>
                </li>
              ) : (
                <li
                  key={
                    suggestion.card.resourceType +
                    "-" +
                    suggestion.card.resourceId
                  }
                  className="search-hint search-hint--lockup"
                  data-index={index}
                  role="option"
                  aria-selected={activeIndex === index}
                  tabIndex={-1}
                  id={"search-suggestion-" + index}
                  onClick={() => onSelect(suggestion)}
                >
                  <SearchMediaSuggestionLockup card={suggestion.card} />
                </li>
              ),
            )}
          </ul>
        )}
      </div>
    </div>
  );
}
