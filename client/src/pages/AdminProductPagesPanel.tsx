import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  archiveAdminProductPage,
  getAdminProductPageDetail,
  getAdminProductPages,
  getAdminSessionToken,
  permanentlyDeleteAdminProductPage,
  restoreAdminProductPage,
  setAdminProductPageStatus,
  type AdminProductPageDetail,
  type AdminProductPageListItem,
  type AdminProductPageStatusFilter,
} from "../api/admin";
import AdminAnalyticsResetPanel from "./AdminAnalyticsResetPanel";

function formatNaira(value: number) {
  return `₦${value.toLocaleString("en-NG", {
    minimumFractionDigits: value % 1 ? 2 : 0,
    maximumFractionDigits: 2,
  })}`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown date";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function statusLabel(page: Pick<AdminProductPageListItem, "status" | "isArchived">) {
  return page.isArchived ? "Archived" : page.status;
}

function productStatusClass(page: Pick<AdminProductPageListItem, "status" | "isArchived">) {
  return page.isArchived ? "admin-status admin-status-archived" : `admin-status admin-status-${page.status}`;
}

function ActionButton({
  children,
  onClick,
  disabled = false,
  danger = false,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      className={`admin-page-action${danger ? " danger" : ""}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}

export default function AdminProductPagesPanel({
  onLoggedOut,
}: {
  onLoggedOut: () => void;
}) {
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<AdminProductPageStatusFilter>("all");
  const [page, setPage] = useState(1);
  const [pageData, setPageData] = useState<Awaited<ReturnType<typeof getAdminProductPages>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState("");
  const [notice, setNotice] = useState("");
  const [actionError, setActionError] = useState("");
  const [reloadCount, setReloadCount] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminProductPageDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const loadPages = useCallback(async () => {
    setLoading(true);
    setListError("");
    try {
      const data = await getAdminProductPages({ q: search, status, page, pageSize: 20 });
      setPageData(data);
    } catch (loadError) {
      if (!getAdminSessionToken()) {
        onLoggedOut();
        return;
      }
      setListError(loadError instanceof Error ? loadError.message : "Unable to load product pages.");
    } finally {
      setLoading(false);
    }
  }, [onLoggedOut, page, reloadCount, search, status]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  async function openDetails(id: string) {
    setSelectedId(id);
    setDetail(null);
    setDetailLoading(true);
    setActionError("");
    try {
      setDetail(await getAdminProductPageDetail(id));
    } catch (error) {
      if (!getAdminSessionToken()) {
        onLoggedOut();
        return;
      }
      setActionError(error instanceof Error ? error.message : "Unable to load product-page details.");
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetails() {
    setSelectedId(null);
    setDetail(null);
    setActionError("");
  }

  async function performAction(
    item: AdminProductPageListItem,
    action: "publish" | "unpublish" | "archive" | "restore" | "delete",
  ) {
    setNotice("");
    setActionError("");

    const labels = {
      publish: "publish this page",
      unpublish: "unpublish this page immediately",
      archive: "archive this page and remove it from the public site",
      restore: "restore this archived page as hidden",
      delete: "permanently delete this archived page",
    } as const;
    if ((action === "archive" || action === "unpublish" || action === "delete") &&
        !window.confirm(`Are you sure you want to ${labels[action]}?`)) {
      return;
    }

    const reason = window.prompt(
      action === "delete"
        ? "Enter the reason for permanent deletion (required):"
        : "Enter a reason for the admin activity log (optional):",
      "",
    );
    if (reason === null) return;
    if (action === "delete" && !reason.trim()) {
      setActionError("A reason is required for permanent deletion.");
      return;
    }

    setBusyId(item.id);
    try {
      if (action === "publish") {
        await setAdminProductPageStatus(item.id, "published", reason.trim() || null);
        setNotice(`Published “${item.productName}”.`);
      } else if (action === "unpublish") {
        await setAdminProductPageStatus(item.id, "hidden", reason.trim() || null);
        setNotice(`Unpublished “${item.productName}”.`);
      } else if (action === "archive") {
        await archiveAdminProductPage(item.id, reason.trim() || null);
        setNotice(`Archived “${item.productName}”. It is now hidden from the public site.`);
      } else if (action === "restore") {
        await restoreAdminProductPage(item.id, reason.trim() || null);
        setNotice(`Restored “${item.productName}” as hidden. Republish it separately when ready.`);
      } else {
        const deletion = await permanentlyDeleteAdminProductPage(item.id, reason.trim());
        setNotice(
          deletion.storageCleanup === "skipped_non_production"
            ? `Permanently deleted “${item.productName}” from this database. External storage cleanup was skipped outside production to protect a possibly shared Supabase bucket.`
            : `Permanently deleted “${item.productName}”. External image cleanup was attempted.`,
        );
        closeDetails();
      }

      setReloadCount((value) => value + 1);
      if (action !== "delete" && selectedId === item.id) {
        setDetailLoading(true);
        try {
          setDetail(await getAdminProductPageDetail(item.id));
        } finally {
          setDetailLoading(false);
        }
      }
    } catch (actionLoadError) {
      if (!getAdminSessionToken()) {
        onLoggedOut();
        return;
      }
      setActionError(
        actionLoadError instanceof Error
          ? actionLoadError.message
          : "Unable to complete this product-page action.",
      );
    } finally {
      setBusyId(null);
    }
  }

  const pages = pageData?.pages ?? [];
  const pagination = pageData?.pagination;

  return (
    <section className="admin-product-pages">
      <div className="admin-heading admin-product-pages-heading">
        <div>
          <span className="admin-kicker">Platform management</span>
          <h1>Product pages.</h1>
          <p>Search every StatusFly page, inspect its activity, control publication and preserve records with archive/restore.</p>
        </div>
        <div className="admin-page-manager-count">
          <strong>{(pagination?.total ?? 0).toLocaleString("en-NG")}</strong>
          <span>matching pages</span>
        </div>
      </div>

      <article className="admin-panel admin-page-manager-panel">
        <div className="admin-page-manager-toolbar">
          <label className="admin-page-search">
            <span>Search product pages</span>
            <input
              type="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Product, brand, category or public slug"
              maxLength={100}
            />
          </label>
          <label className="admin-page-status-filter">
            <span>Show</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as AdminProductPageStatusFilter);
                setPage(1);
              }}
            >
              <option value="all">All pages</option>
              <option value="published">Published</option>
              <option value="draft">Drafts</option>
              <option value="hidden">Hidden</option>
              <option value="archived">Archived</option>
            </select>
          </label>
        </div>

        {notice ? <div className="admin-page-notice" role="status">{notice}</div> : null}
        {listError ? <div className="admin-error admin-page-inline-error" role="alert">{listError}</div> : null}

        {loading ? (
          <div className="admin-empty-state">Loading product pages…</div>
        ) : listError ? null : pages.length ? (
          <div className="admin-table-wrap admin-managed-pages-table-wrap">
            <table className="admin-table admin-managed-pages-table">
              <thead>
                <tr>
                  <th>Product page</th>
                  <th>Status</th>
                  <th>Price</th>
                  <th>Activity</th>
                  <th>Payments</th>
                  <th>Created</th>
                  <th>Manage</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.productName}</strong>
                      <span>{item.brandName} · {item.category}</span>
                      <small className="admin-managed-page-slug">/p/{item.publicSlug}</small>
                    </td>
                    <td><span className={productStatusClass(item)}>{statusLabel(item)}</span></td>
                    <td>{formatNaira(item.priceNaira)}</td>
                    <td>
                      <strong>{item.pageViews.toLocaleString("en-NG")} views</strong>
                      <span>{item.whatsappClicks.toLocaleString("en-NG")} WhatsApp clicks</span>
                    </td>
                    <td>
                      <strong>{item.successfulPaymentCount} successful</strong>
                      <span>{item.paymentCount} attempts</span>
                    </td>
                    <td>{formatDate(item.createdAt)}</td>
                    <td><ActionButton disabled={Boolean(busyId)} onClick={() => void openDetails(item.id)}>Inspect</ActionButton></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">No product pages match these filters.</div>
        )}

        <div className="admin-page-pagination">
          <span>{pagination ? `Page ${pagination.page} of ${pagination.totalPages}` : "—"}</span>
          <div>
            <ActionButton disabled={!pagination || page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</ActionButton>
            <ActionButton disabled={!pagination || page >= pagination.totalPages || loading} onClick={() => setPage((value) => value + 1)}>Next</ActionButton>
          </div>
        </div>
        <p className="admin-page-manager-footnote">
          Permanent deletion is restricted to archived pages with no payment records. Pages with any payment history must remain archived to preserve the financial trail.
        </p>
      </article>

      {selectedId ? (
        <div className="admin-detail-backdrop">
          <section className="admin-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-page-detail-title">
            <header className="admin-detail-header">
              <div>
                <span className="admin-kicker">Product-page details</span>
                <h2 id="admin-page-detail-title">{detail?.page.productName ?? "Inspect product page"}</h2>
              </div>
              <button type="button" className="admin-detail-close" onClick={closeDetails} aria-label="Close product-page details">×</button>
            </header>

            {detailLoading ? <div className="admin-empty-state">Loading details…</div> : detail ? (
              <>
                <div className="admin-detail-status-line">
                  <span className={productStatusClass(detail.page)}>{statusLabel(detail.page)}</span>
                  <span>{detail.page.brandName}</span>
                  <span>{formatNaira(detail.page.priceNaira)}</span>
                </div>
                <div className="admin-detail-stats">
                  <div><span>Views</span><strong>{detail.page.pageViews.toLocaleString("en-NG")}</strong></div>
                  <div><span>WhatsApp clicks</span><strong>{detail.page.whatsappClicks.toLocaleString("en-NG")}</strong></div>
                  <div><span>Successful payments</span><strong>{detail.page.successfulPaymentCount}</strong></div>
                  <div><span>Recorded paid revenue</span><strong>{formatNaira(detail.page.lifetimeRevenueNaira)}</strong></div>
                  <div><span>Feedback</span><strong>{detail.page.feedbackCount}</strong></div>
                  <div><span>Average rating</span><strong>{detail.page.averageRating === null ? "—" : `${detail.page.averageRating}/5`}</strong></div>
                </div>
                <dl className="admin-detail-fields">
                  <div><dt>Public URL</dt><dd>{`/p/${detail.page.publicSlug}`}</dd></div>
                  <div><dt>Category</dt><dd>{detail.page.category}</dd></div>
                  <div><dt>WhatsApp number</dt><dd>{detail.page.whatsappNumber}</dd></div>
                  <div><dt>Availability</dt><dd>{detail.page.availability.replace(/_/g, " ")}</dd></div>
                  <div><dt>Delivery information</dt><dd>{detail.page.deliveryInfo}</dd></div>
                  <div><dt>Description</dt><dd>{detail.page.description}</dd></div>
                  {detail.page.sellingPoints.length ? <div><dt>Selling points</dt><dd>{detail.page.sellingPoints.join(" · ")}</dd></div> : null}
                  {detail.page.originalPriceNaira !== null ? <div><dt>Original price</dt><dd>{formatNaira(detail.page.originalPriceNaira)}</dd></div> : null}
                  {detail.page.promotionText ? <div><dt>Promotion</dt><dd>{detail.page.promotionText}</dd></div> : null}
                  <div><dt>Created</dt><dd>{formatDate(detail.page.createdAt)}</dd></div>
                  <div><dt>Last updated</dt><dd>{formatDate(detail.page.updatedAt)}</dd></div>
                  {detail.page.archivedAt ? <div><dt>Archived</dt><dd>{formatDate(detail.page.archivedAt)}</dd></div> : null}
                </dl>

                {detail.images.length ? (
                  <div className="admin-detail-images">
                    {detail.images.map((image) => (
                      <a href={image.publicUrl} target="_blank" rel="noreferrer" key={image.id} aria-label={`Open product image ${image.position}`}>
                        <img src={image.publicUrl} alt={`${detail.page.productName} image ${image.position}`} loading="lazy" />
                      </a>
                    ))}
                  </div>
                ) : <div className="admin-empty-state admin-detail-no-images">No images on this page.</div>}

                <AdminAnalyticsResetPanel
                  key={detail.page.id}
                  scopeType="product_page"
                  scopeId={detail.page.id}
                  compact
                  onLoggedOut={onLoggedOut}
                  onReset={async () => {
                    setReloadCount((current) => current + 1);
                    await openDetails(detail.page.id);
                  }}
                />

                {actionError ? <div className="admin-error admin-page-inline-error" role="alert">{actionError}</div> : null}
                <div className="admin-detail-actions">
                  {detail.page.isArchived ? (
                    <ActionButton disabled={Boolean(busyId)} onClick={() => void performAction(detail.page, "restore")}>Restore as hidden</ActionButton>
                  ) : detail.page.status === "published" ? (
                    <ActionButton disabled={Boolean(busyId)} onClick={() => void performAction(detail.page, "unpublish")}>Unpublish</ActionButton>
                  ) : (
                    <ActionButton
                      disabled={Boolean(busyId) || detail.page.successfulPaymentCount < 1}
                      onClick={() => void performAction(detail.page, "publish")}
                    >
                      {detail.page.status === "draft" ? "Publish" : "Republish"}
                    </ActionButton>
                  )}
                  {!detail.page.isArchived ? <ActionButton disabled={Boolean(busyId)} onClick={() => void performAction(detail.page, "archive")}>Archive</ActionButton> : null}
                  {detail.page.isArchived && detail.page.paymentCount === 0 ? (
                    <ActionButton danger disabled={Boolean(busyId)} onClick={() => void performAction(detail.page, "delete")}>Delete permanently</ActionButton>
                  ) : null}
                  {detail.page.status === "published" && !detail.page.isArchived ? (
                    <a className="admin-page-action admin-page-action-link" href={`/p/${detail.page.publicSlug}`} target="_blank" rel="noreferrer">Open public page ↗</a>
                  ) : null}
                </div>
                {detail.page.isArchived && detail.page.paymentCount > 0 ? (
                  <p className="admin-page-manager-footnote">Permanent deletion is disabled because this page has payment records. You can keep it archived or restore it.</p>
                ) : null}
              </>
            ) : (
              <div className="admin-empty-state">Product-page details could not be loaded.</div>
            )}
          </section>
        </div>
      ) : null}
    </section>
  );
}
