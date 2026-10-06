import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getPublicProductPage,
  type PublicProductPageData,
} from "../api/publicProductPages";
import { recordPublicProductPageEvent } from "../api/productPageAnalytics";
import ProductPageShareTools from "../components/ProductPageShareTools";
import { trackPlatformEvent } from "../api/platformAnalytics";

const AVAILABILITY_LABELS: Record<
  PublicProductPageData["availability"],
  string
> = {
  available: "Available",
  low_stock: "Low stock",
  sold_out: "Sold out",
  coming_soon: "Coming soon",
  preorder: "Pre-order",
};

const AVAILABILITY_CLASSES: Record<
  PublicProductPageData["availability"],
  string
> = {
  available: "public-availability-available",
  low_stock: "public-availability-low-stock",
  sold_out: "public-availability-sold-out",
  coming_soon: "public-availability-coming-soon",
  preorder: "public-availability-preorder",
};

function formatNaira(value: number) {
  return `₦${Math.max(0, value).toLocaleString("en-NG")}`;
}

function normalizeWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("0")) {
    return `234${digits.slice(1)}`;
  }

  return digits;
}

function getWhatsAppUrl(
  page: PublicProductPageData,
) {
  const number = normalizeWhatsAppNumber(page.whatsappNumber);

  if (!number) {
    return null;
  }

  const pageUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/p/${page.publicSlug}`
      : `https://statusfly.com/p/${page.publicSlug}`;

  const intent =
    page.availability === "preorder"
      ? "I'd like to place a pre-order."
      : page.availability === "coming_soon"
        ? "I'd like to ask when this product will be available."
        : "I'd like to place an order.";

  const message = [
    `Hello! I'm interested in *${page.productName}* from *${page.brandName}* on StatusFly.`,
    "",
    `*Product:* ${page.productName}`,
    `*Price:* ${formatNaira(page.priceNaira)}`,
    intent,
    "",
    `Product page: ${pageUrl}`,
  ].join("\n");

  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

function formatPromotionEndDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    return null;
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function PublicProductPage() {
  const { slug = "" } = useParams();
  const [page, setPage] = useState<PublicProductPageData | null>(null);
  const [activeImage, setActiveImage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const trackedViewSlug = useRef("");

  useEffect(() => {
    let cancelled = false;

    async function loadPage() {
      setLoading(true);
      setError("");

      try {
        const result = await getPublicProductPage(slug);

        if (!cancelled) {
          setPage(result);
          setActiveImage(0);
        }
      } catch (requestError) {
        if (!cancelled) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : "Unable to load this product page.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    if (slug.trim()) {
      void loadPage();
    } else {
      setError("This product page link is incomplete.");
      setLoading(false);
    }

    return () => {
      cancelled = true;
    };
  }, [slug]);

  useEffect(() => {
    if (!page || trackedViewSlug.current === page.publicSlug) {
      return;
    }

    trackedViewSlug.current = page.publicSlug;
    void recordPublicProductPageEvent(page.publicSlug, "page_view");
    trackPlatformEvent("public_product_page_view");
  }, [page]);

  useEffect(() => {
    if (!page) {
      return;
    }

    document.title = `${page.productName} · ${page.brandName} | StatusFly`;

    const description =
      page.description.trim() ||
      `View ${page.productName} from ${page.brandName} on StatusFly.`;

    let meta = document.querySelector(
      'meta[name="description"]',
    ) as HTMLMetaElement | null;

    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }

    meta.content = description.slice(0, 160);

    return () => {
      document.title = "StatusFly";
    };
  }, [page]);

  const whatsappUrl = useMemo(
    () => (page ? getWhatsAppUrl(page) : null),
    [page],
  );

  const currentImage = page?.images[activeImage] ?? null;

  const hasSale = Boolean(
    page &&
      page.originalPriceNaira &&
      page.originalPriceNaira > page.priceNaira,
  );

  const discountPercent = hasSale && page
    ? Math.round(
        ((page.originalPriceNaira! - page.priceNaira) /
          page.originalPriceNaira!) *
          100,
      )
    : 0;

  const promotionEndDate = page
    ? formatPromotionEndDate(page.promotionEndAt)
    : null;

  const publicUrl = page
    ? typeof window !== "undefined"
      ? `${window.location.origin}/p/${page.publicSlug}`
      : `https://statusfly.com/p/${page.publicSlug}`
    : "https://statusfly.com/p/";

  const structuredData = page
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": `${publicUrl}#product`,
        name: page.productName,
        description:
          page.description.trim() ||
          `View ${page.productName} from ${page.brandName} on StatusFly.`,
        brand: {
          "@type": "Brand",
          name: page.brandName,
        },
        image: page.images.map((image) => image.publicUrl),
        url: publicUrl,
        offers: {
          "@type": "Offer",
          url: publicUrl,
          priceCurrency: "NGN",
          price: page.priceNaira,
          availability:
            page.availability === "available"
              ? "https://schema.org/InStock"
              : page.availability === "low_stock"
                ? "https://schema.org/LimitedAvailability"
                : page.availability === "sold_out"
                  ? "https://schema.org/OutOfStock"
                  : page.availability === "preorder"
                    ? "https://schema.org/PreOrder"
                    : undefined,
        },
      }
    : null;

  const ctaLabel =
    !page || page.availability === "sold_out"
      ? "Sold out"
      : page.availability === "preorder"
        ? "Pre-order on WhatsApp"
        : page.availability === "coming_soon"
          ? "Ask on WhatsApp"
          : "Order on WhatsApp";

  function handleWhatsAppClick() {
    if (!page || !whatsappUrl || page.availability === "sold_out") {
      return;
    }

    void recordPublicProductPageEvent(
      page.publicSlug,
      "whatsapp_click",
    );
  }

  if (loading) {
    return (
      <main className="public-product-page public-state-page">
        <div className="public-state-card">
          <span className="public-state-kicker">StatusFly</span>
          <div className="public-loading-mark" aria-hidden="true" />
          <h1>Loading product page</h1>
          <p>Getting the product details ready.</p>
        </div>
      </main>
    );
  }

  if (error || !page) {
    return (
      <main className="public-product-page public-state-page">
        <div className="public-state-card">
          <span className="public-state-kicker">StatusFly</span>
          <h1>Product page unavailable.</h1>
          <p>{error || "This product page could not be found."}</p>
          <Link className="button button-primary" to="/">
            Back to StatusFly
            <span className="button-accent">↗</span>
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="public-product-page">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(structuredData),
        }}
      />
      <div className="public-product-shell">
        <header className="public-product-nav">
          <Link className="brand brand-mark" to="/">
            StatusFly
          </Link>

          <span className="public-product-nav-note">
            Product page
          </span>
        </header>

        <div className="public-product-main">
          <section className="public-product-gallery-column">
            <div className="public-product-gallery">
              {currentImage ? (
                <img
                  src={currentImage.publicUrl}
                  alt={page.productName}
                />
              ) : (
                <div className="public-product-gallery-empty">
                  <strong>No product image</strong>
                  <span>The seller has not added an image.</span>
                </div>
              )}

              <div className="public-gallery-status">
                <span>
                  {page.images.length
                    ? `${activeImage + 1} / ${page.images.length}`
                    : "Product"}
                </span>

                <span>Product</span>
              </div>

              {page.images.length > 1 ? (
                <>
                  <button
                    type="button"
                    className="public-gallery-control left"
                    aria-label="Previous product image"
                    onClick={() =>
                      setActiveImage(
                        activeImage === 0
                          ? page.images.length - 1
                          : activeImage - 1,
                      )
                    }
                  >
                    ←
                  </button>

                  <button
                    type="button"
                    className="public-gallery-control right"
                    aria-label="Next product image"
                    onClick={() =>
                      setActiveImage(
                        activeImage === page.images.length - 1
                          ? 0
                          : activeImage + 1,
                      )
                    }
                  >
                    →
                  </button>
                </>
              ) : null}
            </div>

            {page.images.length > 1 ? (
              <div
                className="public-product-thumbnails"
                aria-label="Product images"
              >
                {page.images.map((image, index) => (
                  <button
                    type="button"
                    key={image.id}
                    className={`public-product-thumbnail ${
                      index === activeImage ? "active" : ""
                    }`}
                    aria-label={`Show image ${index + 1}`}
                    aria-pressed={index === activeImage}
                    onClick={() => setActiveImage(index)}
                  >
                    <img
                      src={image.publicUrl}
                      alt=""
                      aria-hidden="true"
                    />
                  </button>
                ))}
              </div>
            ) : null}
          </section>

          <section className="public-product-details">
            <div className="public-product-heading">
              <div>
                <span className="public-product-category">
                  {page.category}
                </span>
                <p className="public-product-brand">
                  {page.brandName}
                </p>
              </div>

              <span
                className={`public-product-availability ${
                  AVAILABILITY_CLASSES[page.availability]
                }`}
              >
                <span />
                {AVAILABILITY_LABELS[page.availability]}
              </span>
            </div>

            <h1>{page.productName}</h1>

            <p className="public-product-description">
              {page.description}
            </p>

            <div className="public-product-price-row">
              <strong>{formatNaira(page.priceNaira)}</strong>

              {hasSale ? (
                <>
                  <span className="public-product-original-price">
                    {formatNaira(page.originalPriceNaira!)}
                  </span>
                  <span className="public-product-discount">
                    Save {discountPercent}%
                  </span>
                </>
              ) : null}
            </div>

            {page.promotionText ? (
              <div className="public-product-promotion">
                <span className="public-promotion-icon">%</span>

                <div>
                  <span>Current offer</span>
                  <strong>{page.promotionText}</strong>
                  {promotionEndDate ? (
                    <small>Ends {promotionEndDate}</small>
                  ) : null}
                </div>
              </div>
            ) : null}

            {page.sellingPoints.length ? (
              <section className="public-product-section">
                <div className="public-product-section-label">
                  Why customers choose it
                </div>

                <div className="public-product-benefits">
                  {page.sellingPoints.map((point, index) => (
                    <div
                      className="public-product-benefit"
                      key={`${point}-${index}`}
                    >
                      <span>✓</span>
                      <strong>{point}</strong>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            <div className="public-product-info-grid">
              <div>
                <span>Availability</span>
                <strong>
                  {AVAILABILITY_LABELS[page.availability]}
                </strong>
              </div>

              <div>
                <span>Delivery</span>
                <strong>{page.deliveryInfo}</strong>
              </div>
            </div>

            <div
              className={`public-product-order-card ${
                !whatsappUrl || page.availability === "sold_out"
                  ? "disabled"
                  : ""
              }`}
            >
              <div>
                <span>
                  {page.availability === "sold_out"
                    ? "Currently unavailable"
                    : "Ready to order?"}
                </span>
                <strong>
                  {page.whatsappNumber
                    ? `WhatsApp · ${page.whatsappNumber}`
                    : "WhatsApp number unavailable"}
                </strong>
              </div>

              {whatsappUrl && page.availability !== "sold_out" ? (
                <a
                  className="public-product-order-button"
                  href={whatsappUrl}
                  onClick={handleWhatsAppClick}
                >
                  {ctaLabel}
                  <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <span className="public-product-order-button disabled">
                  {ctaLabel}
                </span>
              )}
            </div>

            <ProductPageShareTools
              publicUrl={publicUrl}
              productName={page.productName}
              priceNaira={page.priceNaira}
              brandName={page.brandName}
              promotionText={page.promotionText}
              slug={page.publicSlug}
            />

            <footer className="public-product-footer">
              <span>Simple product page</span>
              <span>One clear action</span>
              <span>Built for mobile</span>
            </footer>
          </section>
        </div>
      </div>
    </main>
  );
}

export default PublicProductPage;
