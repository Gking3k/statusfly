import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ChangeEvent, FormEvent } from "react";
import PaystackPop from "@paystack/inline-js";
import StyleSelector from "../components/StyleSelector";
import StatusPreview from "../components/StatusPreview";
import CaptionPreview from "../components/CaptionPreview";
import FeedbackForm from "../components/FeedbackForm";
import { initializePayment, verifyPayment } from "../api/payments";
import {
  downloadSlide,
  downloadStatusPack,
} from "../utils/generateStatusPack";
import type {
  ProductCategory,
  ProductData,
  StatusFlyStyle,
} from "../types/statusfly";

type BuilderProduct = ProductData & {
  sellingPoints: [string, string, string];
};

const initialProduct: BuilderProduct = {
  image: null,
  name: "",
  price: "",
  description: "",
  whatsappNumber: "",
  extraDetails: "",
  category: "shoes",
  style: "clean",
  sellingPoints: ["", "", ""],
};

const categories: Array<{
  value: ProductCategory;
  label: string;
}> = [
  { value: "shoes", label: "Shoes" },
  { value: "fashion", label: "Fashion" },
  { value: "hair", label: "Hair & Wigs" },
  { value: "beauty", label: "Beauty" },
  { value: "perfume", label: "Perfume" },
  { value: "food", label: "Food" },
  { value: "jewelry", label: "Jewelry" },
  { value: "electronics", label: "Electronics" },
];

const slides = [
  "Hook",
  "Product",
  "Why it",
  "Price",
  "Order",
];

const slideHints = [
  "Make them stop scrolling",
  "Show the product beautifully",
  "Give them reasons to care",
  "Make the price obvious",
  "Tell them what to do next",
];

function CreatePage() {
  const [product, setProduct] = useState<BuilderProduct>(initialProduct);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [activeSlide, setActiveSlide] = useState(1);
  const [downloadState, setDownloadState] = useState<"idle" | "working" | "done" | "error">("idle");
  const [downloadMessage, setDownloadMessage] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [campaignId, setCampaignId] = useState(() => crypto.randomUUID());
  const campaignIdRef = useRef(campaignId);
  const [paymentReference, setPaymentReference] = useState<string | null>(null);
  const [paymentState, setPaymentState] = useState<
    "idle" | "initializing" | "waiting" | "verifying" | "paid" | "error"
  >("idle");
  const [paymentMessage, setPaymentMessage] = useState("");
  const [imageError, setImageError] = useState("");
  const [isValidatingImage, setIsValidatingImage] = useState(false);
  const [feedbackVisible, setFeedbackVisible] = useState(false);

  const exportRefs = useRef<Array<HTMLDivElement | null>>([]);
  const pollingGenerationRef = useRef(0);

  useEffect(() => {
    campaignIdRef.current = campaignId;
  }, [campaignId]);

  useEffect(() => {
    let cancelled = false;

    if (!product.image) {
      setImageUrl(null);
      return () => {
        cancelled = true;
      };
    }

    const reader = new FileReader();

    reader.onload = () => {
      if (!cancelled) {
        setImageUrl(typeof reader.result === "string" ? reader.result : null);
      }
    };

    reader.onerror = () => {
      if (!cancelled) {
        setImageUrl(null);
      }
    };

    reader.readAsDataURL(product.image);

    return () => {
      cancelled = true;
      reader.abort();
    };
  }, [product.image]);

  const validation = useMemo(() => {
    const errors: string[] = [];
    const name = product.name.trim();
    const description = product.description.trim();
    const whatsapp = product.whatsappNumber.trim();
    const price = Number(product.price.replace(/,/g, ""));

    if (!product.image) errors.push("product image");
    if (name.length < 2) errors.push("product name");
    if (name.length > 36) errors.push("product name length");
    if (!Number.isFinite(price) || price <= 0) errors.push("price");
    if (description.length < 5) errors.push("description");
    if (whatsapp.length < 7 || !/^[0-9+()\s-]+$/.test(whatsapp)) {
      errors.push("WhatsApp number");
    }
    if (product.sellingPoints.some((point) => point.trim().length < 2)) {
      errors.push("all three selling points");
    }

    return { errors };
  }, [product]);

  const completion = useMemo(() => {
    const checks = [
      Boolean(product.image),
      product.name.trim().length >= 2,
      Number(product.price.replace(/,/g, "")) > 0,
      product.description.trim().length >= 5,
      product.whatsappNumber.trim().length >= 7,
      ...product.sellingPoints.map((point) => point.trim().length >= 2),
    ];

    const completed = checks.filter(Boolean).length;
    return Math.round((completed / checks.length) * 100);
  }, [product]);

  const campaignReady = validation.errors.length === 0 && Boolean(imageUrl) && !isValidatingImage;
  const paymentVerified = paymentState === "paid";
  const canDownload = campaignReady && paymentVerified;

  function invalidatePayment(nextMessage = "Campaign changed. Payment is no longer valid for this version.") {
    pollingGenerationRef.current += 1;

    if (paymentState !== "idle") {
      const nextCampaignId = crypto.randomUUID();
      campaignIdRef.current = nextCampaignId;
      setPaymentState("idle");
      setPaymentReference(null);
      setPaymentMessage(nextMessage);
      setCampaignId(nextCampaignId);
    }

    setDownloadState("idle");
    setDownloadMessage("");
  }

  function updateField(
    field: Exclude<keyof BuilderProduct, "image" | "sellingPoints">,
    value: string,
  ) {
    invalidatePayment();

    setProduct((current) => ({
      ...current,
      [field]: value,
    }));
  }

  function updateSellingPoint(index: number, value: string) {
    setProduct((current) => {
      const sellingPoints: [string, string, string] = [
        ...current.sellingPoints,
      ];
      sellingPoints[index] = value;

      return {
        ...current,
        sellingPoints,
      };
    });
    invalidatePayment();
  }

  async function handleImageChange(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;

    setImageError("");

    const allowedTypes = new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);

    if (!allowedTypes.has(file.type)) {
      setImageError("Please choose a JPG, PNG, or WebP image.");
      input.value = "";
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setImageError("Please choose an image smaller than 10MB.");
      input.value = "";
      return;
    }

    setIsValidatingImage(true);

    try {
      const url = URL.createObjectURL(file);

      await new Promise<void>((resolve, reject) => {
        const image = new Image();

        image.onload = () => {
          URL.revokeObjectURL(url);
          resolve();
        };

        image.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("This image could not be decoded."));
        };

        image.src = url;
      });

      invalidatePayment();

      setProduct((current) => ({
        ...current,
        image: file,
      }));
    } catch {
      setImageError("That image could not be read. Please choose a different image.");
      input.value = "";
    } finally {
      setIsValidatingImage(false);
    }
  }

  function changeStyle(style: StatusFlyStyle) {
    setProduct((current) => ({
      ...current,
      style,
    }));
    invalidatePayment();
  }

  function removeImage() {
    setImageError("");
    setProduct((current) => ({
      ...current,
      image: null,
    }));
    invalidatePayment();
  }

  async function handleDownloadCurrent() {
    const node = exportRefs.current[activeSlide - 1];

    if (!node || !canDownload || downloadState === "working") return;

    try {
      setDownloadState("working");
      setDownloadMessage("Preparing your PNG…");

      await downloadSlide(node, product.name, activeSlide - 1);

      setDownloadState("done");
      setDownloadMessage("Slide downloaded.");
      setFeedbackVisible(true);
    } catch (error) {
      console.error(error);
      setDownloadState("error");
      setDownloadMessage("We couldn't create that slide. Please try again.");
    }
  }

  async function handleDownloadPack() {
    const nodes = exportRefs.current.filter(
      (node): node is HTMLDivElement => Boolean(node),
    );

    if (!canDownload || nodes.length !== 5 || downloadState === "working") {
      return;
    }

    try {
      setDownloadState("working");
      setDownloadMessage("Rendering all five slides…");

      await downloadStatusPack(nodes, product.name);

      setDownloadState("done");
      setDownloadMessage("Your 5-slide PNG pack is ready.");
      setFeedbackVisible(true);
    } catch (error) {
      console.error(error);
      setDownloadState("error");
      setDownloadMessage("We couldn't create the pack. Please try again.");
    }
  }

  async function verifyExistingPayment(
    reference: string,
    expectedCampaignId: string,
  ): Promise<"paid" | "pending" | "failed" | "error"> {
    try {
      setPaymentState("verifying");
      setPaymentMessage("Confirming your payment with Paystack…");

      const result = await verifyPayment({
        reference,
        campaignId: expectedCampaignId,
      });

      if (result.verified) {
        setPaymentState("paid");
        setPaymentMessage("Payment confirmed. Your downloads are unlocked.");
        return "paid";
      }

      if (["failed", "abandoned", "reversed", "invalid"].includes(result.status)) {
        setPaymentState("error");
        setPaymentMessage("That payment was not completed. You can try again.");
        return "failed";
      }

      setPaymentState("waiting");
      setPaymentMessage("Payment is still being processed. We're checking again…");
      return "pending";
    } catch (error) {
      console.error(error);
      setPaymentState("error");
      setPaymentMessage("We couldn't confirm the payment yet. Please try checking again.");
      return "error";
    }
  }

  async function pollForPayment(reference: string, expectedCampaignId: string) {
    const maxAttempts = 60;
    const activeCampaignId = expectedCampaignId;
    const pollingGeneration = ++pollingGenerationRef.current;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));

      if (pollingGeneration !== pollingGenerationRef.current) return;

      // Product changes create a new campaign id. Never unlock a different campaign
      // with an older payment attempt.
      if (activeCampaignId !== campaignIdRef.current) {
        return;
      }

      const result = await verifyExistingPayment(reference, activeCampaignId);

      if (result === "paid" || result === "failed" || result === "error") {
        return;
      }
    }

    if (pollingGeneration !== pollingGenerationRef.current) return;

    setPaymentState("error");
    setPaymentMessage(
      "We couldn't confirm the payment within two minutes. If you completed it, use Check payment below.",
    );
  }

  function isValidEmail(value: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
  }

  async function handleStartPayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!campaignReady || paymentState === "initializing" || paymentState === "waiting" || paymentState === "verifying") {
      return;
    }

    const email = customerEmail.trim();

    if (!isValidEmail(email)) {
      setPaymentState("error");
      setPaymentMessage("Please enter a valid email address to continue.");
      return;
    }

    try {
      pollingGenerationRef.current += 1;
      setPaymentState("initializing");
      setPaymentMessage("Preparing your secure checkout…");
      setPaymentReference(null);

      const currentCampaignId = campaignId;
      const response = await initializePayment({
        email,
        campaignId: currentCampaignId,
        productName: product.name,
      });

      setPaymentReference(response.reference);
      setPaymentState("waiting");
      setPaymentMessage("Complete the ₦1,000 payment in the secure checkout.");

      const popup = new PaystackPop();
      popup.resumeTransaction(response.accessCode);

      void pollForPayment(response.reference, currentCampaignId);
    } catch (error) {
      console.error(error);
      setPaymentState("error");
      setPaymentMessage("We couldn't start payment. Please try again.");
    }
  }

  async function handleManualVerify() {
    if (!paymentReference || paymentState === "verifying") return;

    await verifyExistingPayment(paymentReference, campaignIdRef.current);
  }

  return (
    <main className="builder-page">
      <div className="builder-background builder-background-one" />
      <div className="builder-background builder-background-two" />

      <header className="builder-header">
        <div className="builder-brand-group">
          <div className="brand-lockup">
            <span className="brand-dot" />
            <p className="brand">StatusFly</p>
          </div>
          <span className="builder-title">Create your campaign</span>
        </div>

        <div className="builder-progress">
          <div className="progress-copy">
            <span>Campaign readiness</span>
            <strong>{completion}%</strong>
          </div>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${completion}%` }}
            />
          </div>
        </div>
      </header>

      <div className="builder-layout">
        <section className="builder-form">
          <div className="form-card form-card-featured">
            <div className="section-heading">
              <span>01</span>
              <div>
                <h2>Start with the product</h2>
                <p>One good photo is all we need to begin.</p>
              </div>
            </div>

            <label className="upload-box">
              {imageUrl ? (
                <>
                  <img
                    src={imageUrl}
                    alt="Uploaded product"
                    className="upload-preview"
                  />
                  <span className="upload-overlay">
                    <strong>Change photo</strong>
                    <span>Use another image</span>
                  </span>
                  <button
                    type="button"
                    className="remove-image"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      removeImage();
                    }}
                  >
                    Remove
                  </button>
                </>
              ) : (
                <div className="upload-empty">
                  <span className="upload-icon">+</span>
                  <strong>Drop your product photo here</strong>
                  <span>or click to browse · JPG, PNG, WebP · max 10MB</span>
                </div>
              )}

              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleImageChange}
              />
            </label>
            {imageError ? (
              <p className="field-error" role="alert">{imageError}</p>
            ) : null}
          </div>

          <div className="form-card">
            <div className="section-heading">
              <span>02</span>
              <div>
                <h2>Give it a voice</h2>
                <p>Clear information creates better creative.</p>
              </div>
            </div>

            <div className="form-grid">
              <label className="field full">
                <span>Product name</span>
                <input
                  type="text"
                  value={product.name}
                  placeholder="e.g. Rose Clay Rice Polish"
                  maxLength={36}
                  onChange={(event) => updateField("name", event.target.value)}
                />
                <small>{product.name.length}/36 · Shorter names look stronger</small>
              </label>

              <label className="field">
                <span>Price</span>
                <div className="price-input">
                  <span>₦</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={product.price}
                    placeholder="2,500"
                    onChange={(event) =>
                      updateField(
                        "price",
                        event.target.value.replace(/[^\d,]/g, ""),
                      )
                    }
                  />
                </div>
              </label>

              <label className="field">
                <span>Category</span>
                <select
                  value={product.category}
                  onChange={(event) =>
                    updateField(
                      "category",
                      event.target.value as ProductCategory,
                    )
                  }
                >
                  {categories.map((category) => (
                    <option key={category.value} value={category.value}>
                      {category.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field full">
                <span>Short description</span>
                <textarea
                  value={product.description}
                  placeholder="What makes this worth buying?"
                  rows={4}
                  maxLength={150}
                  onChange={(event) =>
                    updateField("description", event.target.value)
                  }
                />
                <small>{product.description.length}/150</small>
              </label>

              <label className="field full">
                <span>Product details</span>
                <input
                  type="text"
                  value={product.extraDetails}
                  placeholder="e.g. 60ml · Suitable for daily use · Nationwide delivery"
                  maxLength={100}
                  onChange={(event) =>
                    updateField("extraDetails", event.target.value)
                  }
                />
              </label>

              <label className="field full">
                <span>WhatsApp number</span>
                <input
                  type="tel"
                  value={product.whatsappNumber}
                  placeholder="08012345678"
                  maxLength={20}
                  onChange={(event) =>
                    updateField("whatsappNumber", event.target.value)
                  }
                />
              </label>
            </div>
          </div>

          <div className="form-card">
            <div className="section-heading">
              <span>03</span>
              <div>
                <h2>Give customers three reasons</h2>
                <p>Keep each selling point short and specific.</p>
              </div>
            </div>

            <div className="selling-point-fields">
              {product.sellingPoints.map((point, index) => (
                <label className="selling-point-field" key={index}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <input
                    type="text"
                    value={point}
                    placeholder={
                      [
                        "e.g. Gentle on the skin",
                        "e.g. Made with premium ingredients",
                        "e.g. Perfect for daily use",
                      ][index]
                    }
                    maxLength={48}
                    onChange={(event) =>
                      updateSellingPoint(index, event.target.value)
                    }
                  />
                </label>
              ))}
            </div>
          </div>

          <div className="form-card">
            <div className="section-heading">
              <span>04</span>
              <div>
                <h2>Choose the mood</h2>
                <p>The same product, four different campaign personalities.</p>
              </div>
            </div>

            <StyleSelector value={product.style} onChange={changeStyle} />
          </div>
        </section>

        <section className="preview-panel">
          <div className="preview-header">
            <div>
              <span>LIVE PREVIEW</span>
              <strong>{slides[activeSlide - 1]}</strong>
              <small>{slideHints[activeSlide - 1]}</small>
            </div>

            <div className="preview-status-chip">
              <span className="preview-status-dot" />
              WhatsApp Status
            </div>
          </div>

          <div className="preview-stage">
            <div
              className={`preview-design-shell ${
                !paymentVerified && activeSlide > 1 ? "is-locked" : ""
              }`}
              aria-label={
                !paymentVerified && activeSlide > 1
                  ? `Slide ${String(activeSlide).padStart(2, "0")} locked until payment`
                  : `Slide ${String(activeSlide).padStart(2, "0")} preview`
              }
            >
              <div
                className="preview-design-artwork"
                onDragStart={(event) => {
                  if (!paymentVerified && activeSlide > 1) {
                    event.preventDefault();
                  }
                }}
                style={
                  !paymentVerified && activeSlide > 1
                    ? {
                        filter: "blur(9px)",
                        transform: "scale(1.045)",
                        userSelect: "none",
                        pointerEvents: "none",
                      }
                    : undefined
                }
              >
                <StatusPreview
                  product={product}
                  imageUrl={imageUrl}
                  slide={activeSlide}
                />
              </div>

              {!paymentVerified && activeSlide === 1 ? (
                <div className="preview-watermark" aria-hidden="true">
                  <span>STATUSFLY · FREE PREVIEW</span>
                  <span>STATUSFLY · FREE PREVIEW</span>
                  <span>STATUSFLY · FREE PREVIEW</span>
                </div>
              ) : null}

              {!paymentVerified && activeSlide > 1 ? (
                <div className="preview-lock-overlay">
                  <div className="preview-lock-icon">⌑</div>
                  <strong>Slide {String(activeSlide).padStart(2, "0")} is locked</strong>
                  <span>Unlock all 5 HD statuses for ₦1,000.</span>
                </div>
              ) : null}
            </div>
          </div>

          <div className="slide-tabs">
            {slides.map((slide, index) => {
              const slideNumber = index + 1;

              return (
                <button
                  key={slide}
                  type="button"
                  className={activeSlide === slideNumber ? "active" : ""}
                  disabled={!paymentVerified && slideNumber > 1}
                  aria-disabled={!paymentVerified && slideNumber > 1}
                  onClick={() => {
                    if (!paymentVerified && slideNumber > 1) return;
                    setActiveSlide(slideNumber);
                  }}
                >
                  <span>{String(slideNumber).padStart(2, "0")}</span>
                  <strong>{slide}</strong>
                  {!paymentVerified && slideNumber > 1 ? (
                    <em>Locked</em>
                  ) : null}
                </button>
              );
            })}
          </div>

          <div className="download-panel">
            <div className="download-panel-copy">
              <span>{paymentVerified ? "PAYMENT CONFIRMED" : "FREE PREVIEW"}</span>
              <strong>5 polished WhatsApp statuses</strong>
              <small>
                {paymentVerified
                  ? "Your ₦1,000 payment is confirmed. Your downloads are unlocked."
                  : campaignReady
                    ? "Slide 1 is free to preview. Unlock the full 5-slide HD pack and caption for ₦1,000."
                    : "Complete your campaign before checkout becomes available."}
              </small>
            </div>

            {!paymentVerified ? (
              <form className="payment-form" onSubmit={handleStartPayment} noValidate>
                <label className="payment-email-field">
                  <span>Email address</span>
                  <input
                    type="email"
                    value={customerEmail}
                    placeholder="you@example.com"
                    autoComplete="email"
                    required
                    aria-invalid={paymentState === "error" && !isValidEmail(customerEmail) ? true : undefined}
                    disabled={paymentState === "initializing" || paymentState === "waiting" || paymentState === "verifying"}
                    onChange={(event) => {
                      setCustomerEmail(event.target.value);
                      if (paymentState === "error") {
                        setPaymentState("idle");
                        setPaymentMessage("");
                      }
                    }}
                  />
                  <small>We'll use this for your payment receipt.</small>
                </label>

                <button
                  type="submit"
                  className="download-button primary payment-button"
                  disabled={!campaignReady || isValidatingImage || paymentState === "initializing" || paymentState === "waiting" || paymentState === "verifying"}
                >
                  {paymentState === "initializing"
                    ? "Opening checkout…"
                    : paymentState === "waiting"
                      ? "Waiting for payment…"
                      : paymentState === "verifying"
                        ? "Verifying…"
                        : "Pay ₦1,000 & unlock"}
                </button>
              </form>
            ) : (
              <div className="payment-unlocked">
                <div className="payment-success-mark">✓</div>
                <div>
                  <strong>You're all set.</strong>
                  <span>Download your slides below.</span>
                </div>
              </div>
            )}

            {paymentState === "error" && paymentReference ? (
              <button
                type="button"
                className="payment-check-button"
                onClick={handleManualVerify}
              >
                Check payment ↗
              </button>
            ) : null}

            {paymentMessage ? (
              <p className={`payment-message ${paymentState}`} role="status">
                {paymentMessage}
              </p>
            ) : null}

            {paymentVerified ? (
              <>
                <div className="download-actions">
                  <button
                    type="button"
                    className="download-button secondary"
                    onClick={handleDownloadCurrent}
                    disabled={downloadState === "working"}
                  >
                    {downloadState === "working" ? "Preparing…" : "Download slide"}
                  </button>

                  <button
                    type="button"
                    className="download-button primary"
                    onClick={handleDownloadPack}
                    disabled={downloadState === "working"}
                  >
                    Download pack ↗
                  </button>
                </div>

                {downloadMessage ? (
                  <p className={`download-message ${downloadState}`} role="status">
                    {downloadMessage}
                  </p>
                ) : null}
              </>
            ) : null}
          </div>

          {paymentVerified ? (
            <CaptionPreview product={product} />
          ) : (
            <div className="caption-lock">
              <div className="caption-lock-icon">✦</div>
              <div>
                <strong>Ready-to-copy sales caption</strong>
                <span>Included with your ₦1,000 pack.</span>
              </div>
              <span className="caption-lock-badge">LOCKED</span>
            </div>
          )}

          {feedbackVisible ? <FeedbackForm /> : null}
        </section>
      </div>

      <div className="export-stage" aria-hidden="true">
        {slides.map((_, index) => (
          <div
            key={`export-${index}`}
            className="export-capture"
            ref={(node) => {
              exportRefs.current[index] = node;
            }}
          >
            <StatusPreview
              product={product}
              imageUrl={imageUrl}
              slide={index + 1}
              exportMode
            />
          </div>
        ))}
      </div>
    </main>
  );
}

export default CreatePage;
