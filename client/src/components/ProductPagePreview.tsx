import type {
  BuilderImage,
  ProductPageAvailability,
} from "../types/productPage";

interface ProductPagePreviewProps {
  brandName: string;
  productName: string;
  category: string;
  description: string;
  price: string;
  originalPrice: string;
  promotionText: string;
  availability: ProductPageAvailability;
  sellingPoints: string[];
  whatsappNumber: string;
  deliveryInfo: string;
  images: BuilderImage[];
  activeImage: number;
  publicSlug?: string;
  onSelectImage: (index: number) => void;
}

const AVAILABILITY_LABELS: Record<ProductPageAvailability, string> = {
  available: "Available",
  low_stock: "Low stock",
  sold_out: "Sold out",
  coming_soon: "Coming soon",
  preorder: "Pre-order",
};

const AVAILABILITY_STYLES: Record<
  ProductPageAvailability,
  string
> = {
  available: "available",
  low_stock: "low-stock",
  sold_out: "sold-out",
  coming_soon: "coming-soon",
  preorder: "preorder",
};

function formatPrice(value: string) {
  const digits = value.replace(/[^\d]/g, "");

  if (!digits) {
    return "₦0";
  }

  return `₦${Number(digits).toLocaleString("en-NG")}`;
}

function parseAmount(value: string) {
  const digits = value.replace(/[^\d]/g, "");
  const amount = Number(digits);

  return Number.isFinite(amount) ? amount : 0;
}

function cleanWhatsAppNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("0")) {
    return `234${digits.slice(1)}`;
  }

  return digits;
}

function ProductPagePreview({
  brandName,
  productName,
  category,
  description,
  price,
  originalPrice,
  promotionText,
  availability,
  sellingPoints,
  whatsappNumber,
  deliveryInfo,
  images,
  activeImage,
  publicSlug,
  onSelectImage,
}: ProductPagePreviewProps) {
  const safeActiveIndex = images.length
    ? Math.min(Math.max(activeImage, 0), images.length - 1)
    : 0;

  const activeImageItem = images[safeActiveIndex];
  const currentPrice = parseAmount(price);
  const previousPrice = parseAmount(originalPrice);

  const hasSale =
    Boolean(currentPrice) &&
    Boolean(previousPrice) &&
    previousPrice > currentPrice;

  const discountPercent = hasSale
    ? Math.round(((previousPrice - currentPrice) / previousPrice) * 100)
    : 0;

  const normalizedWhatsApp = cleanWhatsAppNumber(whatsappNumber);

  const ctaLabel =
    availability === "sold_out"
      ? "Sold out"
      : availability === "preorder"
        ? "Pre-order on WhatsApp"
        : availability === "coming_soon"
          ? "Ask on WhatsApp"
          : "Order on WhatsApp";

  const canOrder = availability !== "sold_out";

  function showPreviousImage() {
    if (images.length < 2) {
      return;
    }

    onSelectImage(
      safeActiveIndex === 0 ? images.length - 1 : safeActiveIndex - 1,
    );
  }

  function showNextImage() {
    if (images.length < 2) {
      return;
    }

    onSelectImage(
      safeActiveIndex === images.length - 1 ? 0 : safeActiveIndex + 1,
    );
  }

  return (
    <div className="product-page-preview">
      <div className="pp-shell">
        <header className="pp-topbar">
          <div className="pp-brand-block">
            <span className="pp-brand-name">
              {brandName.trim() || "Your business name"}
            </span>
            <span className="pp-brand-meta">Product page</span>
          </div>

          <span className="pp-share-chip" aria-hidden="true">
            Share
          </span>
        </header>

        <main>
          <section
            className="pp-gallery"
            aria-label="Product image gallery preview"
          >
            {activeImageItem ? (
              <img
                className="pp-gallery-image"
                src={activeImageItem.url}
                alt={
                  productName.trim()
                    ? `${productName.trim()} — image ${safeActiveIndex + 1}`
                    : `Product preview image ${safeActiveIndex + 1}`
                }
                draggable={false}
              />
            ) : (
              <div className="pp-gallery-empty">
                <span className="pp-gallery-empty-mark">+</span>
                <strong>Your product photo</strong>
                <span>
                  Upload your first image to see the customer view here.
                </span>
              </div>
            )}

            <div className="pp-gallery-top">
              <span className="pp-gallery-count" aria-live="polite">
                {images.length
                  ? `${safeActiveIndex + 1} / ${images.length}`
                  : "0 / 3"}
              </span>

              {images.length > 0 ? (
                <span className="pp-gallery-type">Product</span>
              ) : null}
            </div>

            {images.length > 1 ? (
              <>
                <button
                  type="button"
                  className="pp-gallery-arrow pp-gallery-arrow-left"
                  aria-label="Previous product image"
                  onClick={showPreviousImage}
                >
                  <span aria-hidden="true">←</span>
                </button>

                <button
                  type="button"
                  className="pp-gallery-arrow pp-gallery-arrow-right"
                  aria-label="Next product image"
                  onClick={showNextImage}
                >
                  <span aria-hidden="true">→</span>
                </button>
              </>
            ) : null}

            {images.length > 1 ? (
              <span className="pp-gallery-hint">Tap arrows or a photo to browse</span>
            ) : null}
          </section>

          {images.length > 1 ? (
            <div className="pp-thumbnails" aria-label="Product thumbnails">
              {images.map((image, index) => (
                <button
                  type="button"
                  key={image.url}
                  className={`pp-thumbnail ${
                    index === safeActiveIndex ? "active" : ""
                  }`}
                  aria-label={`Show product image ${index + 1}`}
                  aria-pressed={index === safeActiveIndex}
                  onClick={() => onSelectImage(index)}
                >
                  <img
                    src={image.url}
                    alt=""
                    draggable={false}
                  />
                </button>
              ))}
            </div>
          ) : null}

          <section className="pp-content">
            <div className="pp-category-row">
              <span className="pp-category">
                {category.trim() || "Category"}
              </span>

              <span
                className={`pp-availability ${AVAILABILITY_STYLES[availability]}`}
              >
                <span className="pp-availability-dot" aria-hidden="true" />
                {AVAILABILITY_LABELS[availability]}
              </span>
            </div>

            <h2 className="pp-product-name">
              {productName.trim() || "Your product name"}
            </h2>

            <p className="pp-description">
              {description.trim() ||
                "Your product description will appear here. Keep it clear, useful and focused on the customer."}
            </p>

            <div className="pp-price-row" aria-label="Product price">
              <strong className="pp-current-price">
                {formatPrice(price)}
              </strong>

              {hasSale ? (
                <>
                  <span className="pp-original-price">
                    {formatPrice(originalPrice)}
                  </span>
                  <span className="pp-discount">-{discountPercent}%</span>
                </>
              ) : null}
            </div>

            {promotionText.trim() ? (
              <div className="pp-promo">
                <span className="pp-promo-mark" aria-hidden="true">
                  %
                </span>
                <div>
                  <span className="pp-promo-label">Current offer</span>
                  <strong>{promotionText.trim()}</strong>
                </div>
              </div>
            ) : null}

            {sellingPoints.length ? (
              <div className="pp-benefits">
                <div className="pp-section-label">
                  Why customers choose it
                </div>

                <div className="pp-benefits-list">
                  {sellingPoints.map((point, index) => (
                    <div className="pp-benefit" key={`${point}-${index}`}>
                      <span className="pp-benefit-check" aria-hidden="true">
                        ✓
                      </span>
                      <span>{point}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="pp-info-grid">
              <div className="pp-info-card">
                <span className="pp-info-label">Availability</span>
                <strong>{AVAILABILITY_LABELS[availability]}</strong>
              </div>

              <div className="pp-info-card">
                <span className="pp-info-label">Delivery</span>
                <strong>
                  {deliveryInfo.trim() || "Add delivery information"}
                </strong>
              </div>
            </div>

            <div
              className={`pp-order-card ${!canOrder ? "disabled" : ""}`}
              aria-label={
                canOrder
                  ? "WhatsApp order action preview"
                  : "Product unavailable"
              }
            >
              <div className="pp-order-copy">
                <span className="pp-order-kicker">
                  {canOrder ? "Ready to order?" : "This product is unavailable"}
                </span>

                <strong>
                  {normalizedWhatsApp
                    ? `WhatsApp · ${whatsappNumber}`
                    : "Add your WhatsApp number"}
                </strong>
              </div>

              <span className="pp-order-button">
                {ctaLabel}
                {canOrder ? <span aria-hidden="true">↗</span> : null}
              </span>
            </div>

            <div className="pp-footer-note" aria-hidden="true">
              <span>Simple product page</span>
              <span>One clear action</span>
              <span>Built for mobile</span>
            </div>

            {publicSlug ? (
              <div className="pp-url-note">
                Public URL preview: <strong>/p/{publicSlug}</strong>
              </div>
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}

export default ProductPagePreview;
