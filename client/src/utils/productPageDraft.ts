import type { CreatedProductPage } from "../api/productPages";

const DRAFT_HANDOFF_KEY = "statusfly:product-page-draft";

export interface ProductPageDraftHandoff {
  id: string;
  publicSlug: string;
  editToken: string;
  savedAt: string;
}

function canUseSessionStorage() {
  return typeof window !== "undefined" && "sessionStorage" in window;
}

export function saveProductPageDraftHandoff(
  productPage: CreatedProductPage,
) {
  if (!canUseSessionStorage()) {
    return;
  }

  const handoff: ProductPageDraftHandoff = {
    id: productPage.id,
    publicSlug: productPage.publicSlug,
    editToken: productPage.editToken,
    savedAt: new Date().toISOString(),
  };

  try {
    window.sessionStorage.setItem(
      DRAFT_HANDOFF_KEY,
      JSON.stringify(handoff),
    );
  } catch {
    // Storage can be unavailable or blocked; the current page still works.
  }
}

export function getProductPageDraftHandoff(): ProductPageDraftHandoff | null {
  if (!canUseSessionStorage()) {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(DRAFT_HANDOFF_KEY);

    if (!raw) {
      return null;
    }

    const value = JSON.parse(raw) as Partial<ProductPageDraftHandoff>;

    if (
      typeof value.id !== "string" ||
      typeof value.publicSlug !== "string" ||
      typeof value.editToken !== "string" ||
      typeof value.savedAt !== "string"
    ) {
      return null;
    }

    return value as ProductPageDraftHandoff;
  } catch {
    return null;
  }
}

export function clearProductPageDraftHandoff() {
  if (!canUseSessionStorage()) {
    return;
  }

  try {
    window.sessionStorage.removeItem(DRAFT_HANDOFF_KEY);
  } catch {
    // Ignore storage cleanup failures.
  }
}
