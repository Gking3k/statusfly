import type {
  ProductData,
} from "../types/statusfly";

interface StatusPreviewProps {
  product: ProductData;
  imageUrl: string | null;
  slide: number;
  exportMode?: boolean;

  // Optional Phase 7 content. CreatePage will expose these fields next.
  brandName?: string;
  previousPrice?: string;
  discountText?: string;
  promoText?: string;
  ctaText?: string;
  deliveryInfo?: string;
  socialHandle?: string;
}

function formatPrice(value: string) {
  const number = Number(value.replace(/,/g, ""));

  if (!Number.isFinite(number) || number <= 0) {
    return "₦0";
  }

  return `₦${number.toLocaleString("en-NG")}`;
}

function formatCategory(value: ProductData["category"]) {
  return value.replace(/[-_]/g, " ");
}

function initials(value: string) {
  const clean = value.trim();

  if (!clean) {
    return "SF";
  }

  return clean
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function getBenefits(product: ProductData) {
  const custom = product.extraDetails
    .split(/[•·|]/)
    .map((item) => item.trim())
    .filter(Boolean);

  const defaults = [
    "Quality you can trust",
    "Made for everyday use",
    "Designed to impress",
  ];

  return [...custom, ...defaults].slice(0, 3);
}

function ProductVisual({
  imageUrl,
  product,
  className,
  exportMode,
}: {
  imageUrl: string | null;
  product: ProductData;
  className: string;
  exportMode: boolean;
}) {
  return (
    <div className={`reference-product ${className}`}>
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={product.name || "Product"}
          className="reference-product-image"
        />
      ) : (
        <div className="reference-product-placeholder">
          <span>Add product photo</span>
          <small>JPG · PNG · WebP</small>
        </div>
      )}

      {!exportMode ? (
        <span
          className="reference-product-sheen"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
}

function StatusHeader({
  brand,
  label,
  slide,
}: {
  brand: string;
  label: string;
  slide: number;
}) {
  return (
    <header className="reference-header">
      <div className="reference-brand">
        <span className="reference-brand-mark">
          {initials(brand)}
        </span>

        <span>{brand || "YOUR BRAND"}</span>
      </div>

      <span className="reference-section-label">
        {label}
      </span>

      <span className="reference-counter">
        {String(slide).padStart(2, "0")} — 05
      </span>
    </header>
  );
}

function ReferenceFrame({
  product,
  imageUrl,
  slide,
  exportMode = false,
  brandName = "YOUR BRAND",
  previousPrice,
  discountText,
  promoText,
  ctaText = "Order on WhatsApp",
  deliveryInfo = "Fast Delivery",
  socialHandle,
}: StatusPreviewProps) {
  const price = formatPrice(product.price);
  const benefits = getBenefits(product);
  const category = formatCategory(product.category);
  const brand = brandName.trim() || "YOUR BRAND";
  const description =
    product.description.trim() ||
    "Premium quality made for everyday use.";
  const promotion = promoText?.trim() || "SPECIAL OFFER";
  const oldPrice = previousPrice?.trim()
    ? formatPrice(previousPrice)
    : "";

  if (slide === 1) {
    return (
      <div className="reference-slide reference-slide-hero">
        <span className="reference-corner-mark" aria-hidden="true">
          ✦
        </span>

        <StatusHeader
          brand={brand}
          label="NEW DROP"
          slide={1}
        />

        <div className="reference-hero-copy">
          <span className="reference-overline">
            {category.toUpperCase()}
          </span>

          <h2>
            {product.name || "Your product"}
          </h2>

          <p>{description}</p>
        </div>

        <div className="reference-feature-list">
          {benefits.map((benefit, index) => (
            <div
              className="reference-feature"
              key={`${benefit}-${index}`}
            >
              <span className="reference-feature-icon">
                {index === 0 ? "◉" : index === 1 ? "◌" : "✦"}
              </span>
              <span>{benefit}</span>
            </div>
          ))}
        </div>

        <ProductVisual
          imageUrl={imageUrl}
          product={product}
          className="reference-product-hero"
          exportMode={exportMode}
        />

        <footer className="reference-footer">
          <span>QUALITY • STYLE • VALUE</span>
          <span>→</span>
        </footer>
      </div>
    );
  }

  if (slide === 2) {
    return (
      <div className="reference-slide reference-slide-product">
        <StatusHeader
          brand={brand}
          label="THE PRODUCT"
          slide={2}
        />

        <ProductVisual
          imageUrl={imageUrl}
          product={product}
          className="reference-product-main"
          exportMode={exportMode}
        />

        <div className="reference-product-copy">
          <span className="reference-overline">
            {category.toUpperCase()}
          </span>

          <h2>{product.name || "Product name"}</h2>

          <p>{description}</p>
        </div>

        <div className="reference-product-specs">
          {benefits.map((benefit, index) => (
            <div
              className="reference-spec"
              key={`${benefit}-${index}`}
            >
              <span className="reference-spec-icon">
                {index === 0 ? "◉" : index === 1 ? "◌" : "◇"}
              </span>

              <small>{benefit}</small>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (slide === 3) {
    return (
      <div className="reference-slide reference-slide-benefits">
        <StatusHeader
          brand={brand}
          label="WHY IT'S PERFECT"
          slide={3}
        />

        <div className="reference-benefit-heading">
          <span className="reference-overline">
            {category.toUpperCase()}
          </span>

          <h2>
            {product.name
              ? `Designed for a better ${category}`
              : "Designed for a better experience"}
          </h2>
        </div>

        <div className="reference-benefit-list">
          {benefits.map((benefit, index) => (
            <div
              className="reference-benefit-row"
              key={`${benefit}-${index}`}
            >
              <span className="reference-benefit-number">
                {String(index + 1).padStart(2, "0")}
              </span>

              <div>
                <strong>{benefit}</strong>
                <span>
                  {index === 0
                    ? "Built to give your customer confidence."
                    : index === 1
                      ? "Made for the way your customer lives."
                      : "A reason to choose it today."}
                </span>
              </div>

              <span className="reference-benefit-arrow">↗</span>
            </div>
          ))}
        </div>

        <ProductVisual
          imageUrl={imageUrl}
          product={product}
          className="reference-product-benefit"
          exportMode={exportMode}
        />

        <footer className="reference-footer">
          <span>{brand}</span>
          <span>MADE TO BE NOTICED</span>
        </footer>
      </div>
    );
  }

  if (slide === 4) {
    return (
      <div className="reference-slide reference-slide-price">
        <StatusHeader
          brand={brand}
          label="TODAY'S PRICE"
          slide={4}
        />

        <div className="reference-price-copy">
          <span className="reference-offer-pill">
            {promotion}
          </span>

          <span className="reference-overline">
            {category.toUpperCase()}
          </span>

          <strong>{price}</strong>

          {oldPrice ? (
            <div className="reference-old-price">
              <span>{oldPrice}</span>

              {discountText ? (
                <b>{discountText}</b>
              ) : null}
            </div>
          ) : null}
        </div>

        <ProductVisual
          imageUrl={imageUrl}
          product={product}
          className="reference-product-price"
          exportMode={exportMode}
        />

        <div className="reference-price-benefits">
          <span>◉ Original Product</span>
          <span>◇ Warranty Included</span>
          <span>◌ {deliveryInfo}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="reference-slide reference-slide-order">
      <StatusHeader
        brand={brand}
        label="READY TO ORDER?"
        slide={5}
      />

      <ProductVisual
        imageUrl={imageUrl}
        product={product}
        className="reference-product-order"
        exportMode={exportMode}
      />

      <div className="reference-order-copy">
        <h2>Get Yours Today.</h2>

        <p>
          {description}{" "}
          {deliveryInfo ? `${deliveryInfo}.` : ""}
        </p>

        <div className="reference-order-points">
          <span>◉ {deliveryInfo}</span>
          <span>◇ Genuine Product</span>
          <span>◌ Secure Payment</span>
        </div>

        <div className="reference-order-cta">
          <span>{ctaText}</span>
          <span>→</span>
        </div>

        <strong className="reference-whatsapp">
          {product.whatsappNumber || "080 XXX XXXX"}
        </strong>

        {socialHandle ? (
          <span className="reference-social">
            {socialHandle}
          </span>
        ) : null}
      </div>

      <footer className="reference-footer">
        <span>WHATSAPP</span>
        <span>{brand}</span>
      </footer>
    </div>
  );
}

function StatusPreview({
  product,
  imageUrl,
  slide,
  exportMode = false,
  brandName,
  previousPrice,
  discountText,
  promoText,
  ctaText,
  deliveryInfo,
  socialHandle,
}: StatusPreviewProps) {
  return (
    <div
      className={[
        "status-preview",
        `status-${product.style}`,
        "reference-system",
        exportMode ? "export-static" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <ReferenceFrame
        product={product}
        imageUrl={imageUrl}
        slide={slide}
        exportMode={exportMode}
        brandName={brandName}
        previousPrice={previousPrice}
        discountText={discountText}
        promoText={promoText}
        ctaText={ctaText}
        deliveryInfo={deliveryInfo}
        socialHandle={socialHandle}
      />
    </div>
  );
}

export default StatusPreview;
