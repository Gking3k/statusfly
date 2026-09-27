import { useLayoutEffect, useRef } from "react";
import type {
  ProductData,
  StatusFlyStyle,
} from "../types/statusfly";

interface PreviewProduct extends ProductData {
  sellingPoints: [string, string, string];
}

interface StatusPreviewProps {
  product: PreviewProduct;
  imageUrl: string | null;
  slide: number;
  exportMode?: boolean;
}

function formatPrice(value: string) {
  const number = Number(value.replace(/,/g, ""));

  if (!Number.isFinite(number) || number <= 0) {
    return "₦0";
  }

  return `₦${number.toLocaleString("en-NG")}`;
}

function getStyleClass(style: StatusFlyStyle) {
  return `status-preview status-${style}`;
}

function safeText(value: string, fallback: string) {
  return value.trim() || fallback;
}

function getTitleScaleClass(value: string) {
  const length = value.trim().length;

  if (length <= 18) return "title-short";
  if (length <= 28) return "title-medium";
  return "title-long";
}

function FitTitle({
  text,
  className,
  maxFontSize,
  minFontSize,
  lineHeight,
  maxLines,
}: {
  text: string;
  className?: string;
  maxFontSize: number;
  minFontSize: number;
  lineHeight: number;
  maxLines: number;
}) {
  const titleRef = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const element = titleRef.current;
    if (!element) return;

    let cancelled = false;

    const fit = () => {
      if (cancelled) return;

      let size = maxFontSize;

      element.style.fontSize = `${size}px`;
      element.style.lineHeight = String(lineHeight);
      element.style.width = "100%";
      element.style.maxWidth = "100%";
      element.style.maxHeight = `${Math.ceil(size * lineHeight * maxLines)}px`;
      element.style.overflow = "hidden";
      element.style.whiteSpace = "normal";
      element.style.overflowWrap = "anywhere";
      element.style.wordBreak = "break-word";

      while (
        size > minFontSize &&
        (element.scrollHeight > element.clientHeight + 1 ||
          element.scrollWidth > element.clientWidth + 1)
      ) {
        size -= 1;
        element.style.fontSize = `${size}px`;
        element.style.maxHeight = `${Math.ceil(size * lineHeight * maxLines)}px`;
      }
    };

    fit();

    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(fit);
      observer.observe(element);
    }

    const fontsReady = document.fonts?.ready;
    fontsReady?.then(fit).catch(() => undefined);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [text, maxFontSize, minFontSize, lineHeight, maxLines]);

  return (
    <h2 ref={titleRef} className={className}>
      {text}
    </h2>
  );
}

function FitSingleLine({
  text,
  maxFontSize,
  minFontSize,
}: {
  text: string;
  maxFontSize: number;
  minFontSize: number;
}) {
  const valueRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const element = valueRef.current;
    if (!element) return;

    let cancelled = false;

    const fit = () => {
      if (cancelled) return;

      let size = maxFontSize;

      element.style.fontSize = `${size}px`;
      element.style.width = "100%";
      element.style.maxWidth = "100%";
      element.style.display = "block";
      element.style.whiteSpace = "nowrap";
      element.style.overflow = "hidden";
      element.style.textOverflow = "clip";

      while (
        size > minFontSize &&
        element.scrollWidth > element.clientWidth + 1
      ) {
        size -= 1;
        element.style.fontSize = `${size}px`;
      }
    };

    fit();

    let observer: ResizeObserver | null = null;

    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(fit);
      observer.observe(element);
    }

    const fontsReady = document.fonts?.ready;
    fontsReady?.then(fit).catch(() => undefined);

    return () => {
      cancelled = true;
      observer?.disconnect();
    };
  }, [text, maxFontSize, minFontSize]);

  return <span ref={valueRef}>{text}</span>;
}

function ProductArt({
  imageUrl,
  productName,
  variant,
}: {
  imageUrl: string | null;
  productName: string;
  variant: string;
}) {
  return imageUrl ? (
    <div className={`status-image-frame ${variant}`}>
      <div className="status-image-shine" aria-hidden="true" />
      <img
        className="status-image"
        src={imageUrl}
        alt={productName || "Product"}
      />
    </div>
  ) : (
    <div className={`status-image-placeholder ${variant}`}>
      <span>Upload product photo</span>
      <small>PNG · JPG · WEBP</small>
    </div>
  );
}

function Graphics({ variant }: { variant: string }) {
  return (
    <div className={`status-graphics ${variant}`} aria-hidden="true">
      <span className="graphic graphic-one" />
      <span className="graphic graphic-two" />
      <span className="graphic graphic-three" />
      <span className="graphic graphic-four" />
    </div>
  );
}

function StatusPreview({
  product,
  imageUrl,
  slide,
  exportMode = false,
}: StatusPreviewProps) {
  const price = formatPrice(product.price);
  const name = safeText(product.name, "Your product");
  const titleScaleClass = getTitleScaleClass(name);
  const description = safeText(
    product.description,
    "A product worth putting in front of your customers.",
  );
  const details = safeText(product.extraDetails, "Available now");
  const whatsapp = safeText(product.whatsappNumber, "080XXXXXXXX");
  const points = product.sellingPoints.map((point, index) =>
    safeText(point, [
      "Quality worth noticing",
      "Made for everyday use",
      "Ready when you are",
    ][index]!),
  ) as [string, string, string];

  const className = `${getStyleClass(product.style)} ${exportMode ? "export-static" : ""}`;

  if (slide === 1) {
    return (
      <div className={className}>
        <Graphics variant="hook" />

        <div className="status-meta-row">
          <span className="status-brand-mark">SF</span>
          <span className="status-counter">01 — 05</span>
        </div>

        <div className="status-hook-copy">
          <span className="status-kicker">NEW DROP</span>
          <div className="status-title-fit">
            <FitTitle
              text={name}
              className={`status-title ${titleScaleClass}`}
              maxFontSize={50}
              minFontSize={28}
              lineHeight={0.9}
              maxLines={3}
            />
          </div>
          <p>{description}</p>
        </div>

        <ProductArt
          imageUrl={imageUrl}
          productName={name}
          variant="art-hook"
        />

        <div className="status-footer-row">
          <span>{product.category}</span>
          <span>{price}</span>
        </div>
      </div>
    );
  }

  if (slide === 2) {
    return (
      <div className={className}>
        <Graphics variant="product" />

        <div className="status-meta-row">
          <span className="status-top-label">THE PIECE</span>
          <span className="status-counter">02 — 05</span>
        </div>

        <ProductArt
          imageUrl={imageUrl}
          productName={name}
          variant="art-product"
        />

        <div className="status-editorial-copy">
          <div>
            <span className="status-kicker">{product.category}</span>
            <div className="status-editorial-title-fit">
              <FitTitle
                text={name}
                className={`status-editorial-title ${titleScaleClass}`}
                maxFontSize={43}
                minFontSize={24}
                lineHeight={0.9}
                maxLines={2}
              />
            </div>
            <p>{description}</p>
          </div>

          <div className="status-details-row">
            <span>{details}</span>
            <span>{price}</span>
          </div>
        </div>
      </div>
    );
  }

  if (slide === 3) {
    return (
      <div className={className}>
        <Graphics variant="why" />

        <div className="status-meta-row">
          <span className="status-top-label">WHY IT</span>
          <span className="status-counter">03 — 05</span>
        </div>

        <div className="status-points">
          {points.map((point, index) => (
            <div className="status-point" key={`${point}-${index}`}>
              <span className="status-point-number">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="status-point-text">{point}</span>
              <span className="status-point-arrow">↗</span>
            </div>
          ))}
        </div>

        <ProductArt
          imageUrl={imageUrl}
          productName={name}
          variant="art-small"
        />

        <div className="status-footer-row">
          <span>{name}</span>
          <span>MADE TO BE NOTICED</span>
        </div>
      </div>
    );
  }

  if (slide === 4) {
    return (
      <div className={className}>
        <Graphics variant="price" />

        <div className="status-meta-row">
          <span className="status-top-label">TODAY'S PRICE</span>
          <span className="status-counter">04 — 05</span>
        </div>

        <div className="status-price-copy">
          <span className="status-kicker status-price-kicker">{name}</span>
          <div className="status-price-value-fit">
            <FitSingleLine
              text={price}
              maxFontSize={78}
              minFontSize={30}
            />
          </div>
          <span>{details}</span>
        </div>

        <ProductArt
          imageUrl={imageUrl}
          productName={name}
          variant="art-price"
        />

        <div className="status-price-cta">
          <span>READY TO SHOP</span>
          <span aria-hidden="true">↗</span>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <Graphics variant="order" />

      <div className="status-meta-row">
        <span className="status-top-label">READY TO ORDER?</span>
        <span className="status-counter">05 — 05</span>
      </div>

      <ProductArt
        imageUrl={imageUrl}
        productName={name}
        variant="art-order"
      />

      <div className="status-order-copy">
        <h2>Let's get yours sorted.</h2>
        <p>
          Send a WhatsApp message to order {name.toLowerCase()}.
        </p>
      </div>

      <div className="status-order-contact">
        <div>
          <span>WHATSAPP</span>
          <strong>{whatsapp}</strong>
        </div>
        <span className="status-order-button">ORDER NOW ↗</span>
      </div>
    </div>
  );
}

export default StatusPreview;
