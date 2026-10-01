import { useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { recordPublicProductPageEvent } from "../api/productPageAnalytics";

type ProductPageShareToolsProps = {
  publicUrl: string;
  productName: string;
  priceNaira: number;
  brandName: string;
  promotionText: string | null;
  slug: string;
};

function formatNaira(value: number) {
  return `₦${Math.max(0, value).toLocaleString("en-NG")}`;
}

function buildShareText({
  productName,
  priceNaira,
  brandName,
  promotionText,
  publicUrl,
}: Omit<ProductPageShareToolsProps, "slug">) {
  const lines = [
    `${productName} — ${formatNaira(priceNaira)}`,
    `From ${brandName}`,
  ];

  if (promotionText?.trim()) {
    lines.push(promotionText.trim());
  }

  lines.push("", publicUrl);

  return lines.join("\n");
}

async function copyText(value: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);
  textarea.select();

  const copied = document.execCommand("copy");
  textarea.remove();

  if (!copied) {
    throw new Error("Unable to copy the product link.");
  }
}

function downloadQrCode(container: HTMLDivElement | null, fileSlug: string) {
  const svg = container?.querySelector("svg");

  if (!svg) {
    throw new Error("QR code is not ready yet.");
  }

  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svg);
  const blob = new Blob([source], {
    type: "image/svg+xml;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `${fileSlug}-qr.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ProductPageShareTools({
  publicUrl,
  productName,
  priceNaira,
  brandName,
  promotionText,
  slug,
}: ProductPageShareToolsProps) {
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const [qrDownloaded, setQrDownloaded] = useState(false);
  const [shareError, setShareError] = useState("");
  const qrContainerRef = useRef<HTMLDivElement | null>(null);

  const shareText = buildShareText({
    publicUrl,
    productName,
    priceNaira,
    brandName,
    promotionText,
  });

  async function handleCopyLink() {
    setShareError("");

    try {
      await copyText(publicUrl);
      setCopied(true);
      void recordPublicProductPageEvent(slug, "share_click");

      window.setTimeout(() => {
        setCopied(false);
      }, 1800);
    } catch {
      setShareError("We couldn't copy the link. Please copy it from your browser address bar.");
    }
  }

  function handleWhatsAppShare() {
    setShareError("");
    void recordPublicProductPageEvent(slug, "share_click");

    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`;
    window.location.assign(whatsappUrl);
  }

  function handleQrToggle() {
    setShareError("");
    setShowQr((current) => !current);
  }

  function handleQrDownload() {
    setShareError("");

    try {
      downloadQrCode(qrContainerRef.current, slug);
      setQrDownloaded(true);
      void recordPublicProductPageEvent(slug, "share_click");

      window.setTimeout(() => {
        setQrDownloaded(false);
      }, 1800);
    } catch {
      setShareError("We couldn't prepare the QR code download. Please try again.");
    }
  }

  return (
    <section className="public-product-share-tools" aria-labelledby="share-product-title">
      <div className="public-product-share-tools-heading">
        <div>
          <span className="public-product-section-label">Share this product</span>
          <h2 id="share-product-title">Send the page anywhere.</h2>
        </div>
        <span className="public-product-share-tools-note">One link. Three ways.</span>
      </div>

      <div className="public-product-share-actions">
        <button
          type="button"
          className="public-product-share-action primary"
          onClick={handleWhatsAppShare}
        >
          <span>Share on WhatsApp</span>
          <span aria-hidden="true">↗</span>
        </button>

        <button
          type="button"
          className="public-product-share-action"
          onClick={() => void handleCopyLink()}
        >
          <span>{copied ? "Link copied" : "Copy product link"}</span>
          <span aria-hidden="true">{copied ? "✓" : "⎘"}</span>
        </button>

        <button
          type="button"
          className="public-product-share-action"
          aria-expanded={showQr}
          aria-controls="public-product-qr"
          onClick={handleQrToggle}
        >
          <span>{showQr ? "Hide QR code" : "Show QR code"}</span>
          <span aria-hidden="true">{showQr ? "−" : "#"}</span>
        </button>
      </div>

      {showQr ? (
        <div className="public-product-qr-panel" id="public-product-qr">
          <div className="public-product-qr-code" ref={qrContainerRef}>
            <QRCodeSVG
              value={publicUrl}
              size={220}
              level="M"
              bgColor="#ffffff"
              fgColor="#111111"
              includeMargin
            />
          </div>

          <div className="public-product-qr-copy">
            <span className="public-product-section-label">Scan to open</span>
            <strong>{productName}</strong>
            <p>Put this QR code on a flyer, package, counter display, or another post.</p>

            <button
              type="button"
              className="public-product-qr-download"
              onClick={handleQrDownload}
            >
              {qrDownloaded ? "QR downloaded" : "Download QR code"}
              <span aria-hidden="true">↓</span>
            </button>
          </div>
        </div>
      ) : null}

      {shareError ? (
        <p className="public-product-share-error" role="status">
          {shareError}
        </p>
      ) : null}
    </section>
  );
}

export default ProductPageShareTools;
