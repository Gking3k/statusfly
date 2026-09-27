import { useState } from "react";
import type { ProductData } from "../types/statusfly";

interface CaptionPreviewProps {
  product: ProductData & {
    sellingPoints: [string, string, string];
  };
}

function formatPrice(value: string) {
  const number = Number(value.replace(/,/g, ""));

  if (!Number.isFinite(number) || number <= 0) {
    return "₦0";
  }

  return `₦${number.toLocaleString("en-NG")}`;
}

function CaptionPreview({ product }: CaptionPreviewProps) {
  const [copied, setCopied] = useState(false);

  const points = product.sellingPoints
    .map((point) => point.trim())
    .filter(Boolean);

  const caption = `🔥 ${product.name || "New arrival"}

${product.description || "Available now."}

${points.length ? points.map((point) => `✓ ${point}`).join("\n") : "✓ Quality worth noticing"}

${formatPrice(product.price)}
${product.extraDetails || "Available now"}

📲 WhatsApp: ${product.whatsappNumber || "080XXXXXXXX"}

Send a message to order.`;

  async function copyCaption() {
    try {
      await navigator.clipboard.writeText(caption);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="caption-box">
      <div className="caption-header">
        <div>
          <span>Sales caption</span>
          <strong>Ready to post with your pack</strong>
        </div>

        <button type="button" onClick={copyCaption}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <pre>{caption}</pre>
    </div>
  );
}

export default CaptionPreview;
