export const HOME_SHELF_PREVIEW_LIMIT = 12;
// Home reads one sentinel card beyond the visible rail. It is never sent to
// the client; its presence is the authoritative signal for the shelf arrow.
export const HOME_SHELF_PREVIEW_FETCH_LIMIT = HOME_SHELF_PREVIEW_LIMIT + 1;
export const HERO_SHELF_PREVIEW_LIMIT = 10;
export const MORE_LIKE_SHELF_LIMIT = 12;
export const RECENTLY_PLAYED_CONTEXT_LIMIT = 30;
