import type { LibraryResourceInput } from "./library-resources.api";

export const DELETE_LIBRARY_CONFIRMATION_EVENT =
  "library:confirm-resource-delete";

export function openDeleteLibraryConfirmation(resource: LibraryResourceInput) {
  window.dispatchEvent(
    new CustomEvent<LibraryResourceInput>(DELETE_LIBRARY_CONFIRMATION_EVENT, {
      detail: resource,
    }),
  );
}
