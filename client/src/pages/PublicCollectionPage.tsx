import { useEffect, useMemo, useState } from "react";
import type { PublicProductPageData, PublicProductPageImage, PublicProductPageItem } from "../api/publicProductPages";
import { recordPublicProductPageEvent } from "../api/productPageAnalytics";
import ProductPageShareTools from "../components/ProductPageShareTools";

type Props = { page: PublicProductPageData };
type ImagePreviewState = { itemId: string; imageIndex: number };

const AVAILABILITY_LABELS: Record<PublicProductPageItem["availability"], string> = {
  available: "Available",
  low_stock: "Low stock",
  sold_out: "Sold out",
  coming_soon: "Coming soon",
  preorder: "Pre-order",
};

function formatNaira(value: number) {
  return `₦${Math.max(0, value).toLocaleString("en-NG")}`;
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") ? `234${digits.slice(1)}` : digits;
}

function PublicCollectionPage({ page }: Props) {
  const [selectedOptions, setSelectedOptions] = useState<Record<string, Record<string, string>>>({});
  const [imagePreview, setImagePreview] = useState<ImagePreviewState | null>(null);
  const publicUrl = typeof window !== "undefined"
    ? `${window.location.origin}/p/${page.publicSlug}`
    : `https://statusfly.app/p/${page.publicSlug}`;
  const sortedItems = useMemo(() => [...page.items].sort((a, b) => a.position - b.position), [page.items]);
  const previewItem = imagePreview ? sortedItems.find((item) => item.id === imagePreview.itemId) ?? null : null;
  const previewImage: PublicProductPageImage | null = previewItem?.images[imagePreview?.imageIndex ?? 0] ?? null;

  useEffect(() => {
    if (!imagePreview) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setImagePreview(null);
      if (!previewItem || previewItem.images.length < 2) return;
      if (event.key === "ArrowRight") {
        setImagePreview((current) => current ? { ...current, imageIndex: (current.imageIndex + 1) % previewItem.images.length } : current);
      }
      if (event.key === "ArrowLeft") {
        setImagePreview((current) => current ? { ...current, imageIndex: (current.imageIndex - 1 + previewItem.images.length) % previewItem.images.length } : current);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [imagePreview, previewItem]);

  function orderUrl(item: PublicProductPageItem) {
    const choices = selectedOptions[item.id] ?? {};
    const message = [
      `Hello ${page.brandName}, I’m interested in this item from your collection on StatusFly.`,
      "",
      `*Item:* ${item.productName}`,
      `*Price:* ${formatNaira(item.priceNaira)}`,
      ...item.options.map((option) => `*${option.name}:* ${choices[option.name] || "Not selected"}`),
      item.availability === "preorder" ? "I would like to place a pre-order." : item.availability === "coming_soon" ? "I’d like to ask when this item will be available." : "I’d like to order this item.",
      "",
      `*Collection:* ${page.collectionTitle || page.brandName}`,
      `Collection link: ${publicUrl}`,
    ].join("\n");
    return `https://wa.me/${normalizePhone(page.whatsappNumber)}?text=${encodeURIComponent(message)}`;
  }

  function hasChosenOptions(item: PublicProductPageItem) {
    return item.options.every((option) => Boolean(selectedOptions[item.id]?.[option.name]));
  }

  function handleOrder(item: PublicProductPageItem) {
    if (item.availability === "sold_out" || !hasChosenOptions(item)) return;
    void recordPublicProductPageEvent(page.publicSlug, "whatsapp_click", item.id);
  }

  function changePreviewImage(step: number) {
    if (!previewItem || !imagePreview || previewItem.images.length < 2) return;
    setImagePreview({
      itemId: previewItem.id,
      imageIndex: (imagePreview.imageIndex + step + previewItem.images.length) % previewItem.images.length,
    });
  }

  return (
    <main className="public-product-page public-collection-page">
      <div className="public-product-shell public-collection-shell">
        <header className="public-product-nav">
          <a className="brand brand-mark" href="/">StatusFly</a>
          <span className="public-product-nav-note">Product collection</span>
        </header>

        <section className="public-collection-hero">
          <span className="collection-kicker">{page.brandName}</span>
          <h1>{page.collectionTitle || "Our Collection"}</h1>
          <p>{page.collectionDescription || "Browse the collection, choose the options you need, and message the seller on WhatsApp to order."}</p>
          <div className="public-collection-meta"><span>{sortedItems.length} {sortedItems.length === 1 ? "item" : "items"}</span><span>Order directly on WhatsApp</span></div>
          <a className="button button-primary collection-browse-button" href="#collection-products">Explore the collection <span aria-hidden="true">↓</span></a>
          <div className="public-collection-assurance" aria-label="Ordering information">
            <span><span aria-hidden="true">✓</span> Choose item options first</span>
            <span><span aria-hidden="true">↗</span> Message the seller directly</span>
            <span><span aria-hidden="true">⌂</span> Confirm delivery details with the seller</span>
          </div>
        </section>

        <section id="collection-products" className="public-collection-grid" aria-label="Products in this collection">
          {sortedItems.map((item) => {
            const firstImage = item.images[0];
            const disabled = item.availability === "sold_out" || !hasChosenOptions(item);
            return (
              <article className="public-collection-card" key={item.id}>
                <div className="public-collection-card-image">
                  {firstImage ? <button className="public-collection-image-open" type="button" onClick={() => setImagePreview({ itemId: item.id, imageIndex: 0 })} aria-label={`View ${item.productName} photo 1 in detail`}><img src={firstImage.publicUrl} alt={item.productName} loading="lazy" /><span className="public-collection-zoom-hint"><span aria-hidden="true">⌕</span> View photos</span></button> : <div className="public-collection-card-empty">No image</div>}
                  <span className={`public-product-availability public-collection-availability public-availability-${item.availability.replace("_", "-")}`}><span />{AVAILABILITY_LABELS[item.availability]}</span>
                  {item.images.length > 1 ? <span className="public-collection-image-count">{item.images.length} photos</span> : null}
                </div>
                <div className="public-collection-card-body">
                  <span className="public-product-category">{item.category}</span>
                  <h2>{item.productName}</h2>
                  <div className="public-collection-card-price">
                    <strong>{formatNaira(item.priceNaira)}</strong>
                    {item.originalPriceNaira && item.originalPriceNaira > item.priceNaira ? <del>{formatNaira(item.originalPriceNaira)}</del> : null}
                    {item.originalPriceNaira && item.originalPriceNaira > item.priceNaira ? <span className="public-collection-sale-label">Sale</span> : null}
                  </div>
                  <p className="public-collection-card-description">{item.description}</p>

                  {item.images.length > 1 ? <div className="public-collection-image-strip" aria-label={`${item.images.length} images of ${item.productName}`}>
                    {item.images.map((image, imageIndex) => <button type="button" key={image.id} onClick={() => setImagePreview({ itemId: item.id, imageIndex })} aria-label={`View ${item.productName} photo ${imageIndex + 1} in detail`}><img src={image.publicUrl} alt={`${item.productName} photo ${imageIndex + 1}`} loading="lazy" /></button>)}
                  </div> : null}

                  {item.options.length ? <div className="public-collection-options"><p className="public-collection-option-instruction">Choose your options</p>{item.options.map((option) => <label className="field" key={option.name}><span className="field-label">{option.name}</span><select value={selectedOptions[item.id]?.[option.name] ?? ""} onChange={(event) => setSelectedOptions((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? {}), [option.name]: event.target.value } }))}><option value="">Choose {option.name.toLowerCase()}</option>{option.values.map((choice) => <option value={choice} key={choice}>{choice}</option>)}</select></label>)}</div> : null}

                  {item.availability === "sold_out" ? <button className="public-product-order-button disabled" type="button" disabled>Sold out</button> : <a className={`public-product-order-button ${disabled ? "disabled" : ""}`} href={disabled ? undefined : orderUrl(item)} aria-disabled={disabled} onClick={(event) => { if (disabled) { event.preventDefault(); return; } handleOrder(item); }}>{disabled ? "Choose options to order" : item.availability === "preorder" ? "Pre-order on WhatsApp" : item.availability === "coming_soon" ? "Ask on WhatsApp" : "Order on WhatsApp"}<span aria-hidden="true">↗</span></a>}
                </div>
              </article>
            );
          })}
        </section>

        <section className="public-collection-delivery"><div><span className="public-product-section-label">Delivery information</span><p>{page.deliveryInfo}</p></div><div><span className="public-product-section-label">Contact</span><p>WhatsApp · {page.whatsappNumber}</p></div></section>
        <ProductPageShareTools publicUrl={publicUrl} productName={page.collectionTitle || "Our Collection"} priceNaira={0} brandName={page.brandName} promotionText={null} slug={page.publicSlug} isCollection />
        <footer className="public-product-footer"><span>One collection link</span><span>Item-specific WhatsApp ordering</span><span>Built for mobile</span></footer>
      </div>

      {imagePreview && previewItem && previewImage ? <div className="public-collection-lightbox-backdrop" role="presentation" onClick={() => setImagePreview(null)}>
        <section className="public-collection-lightbox" role="dialog" aria-modal="true" aria-label={`${previewItem.productName} image preview`} onClick={(event) => event.stopPropagation()}>
          <button type="button" className="public-collection-lightbox-close" autoFocus aria-label="Close image preview" onClick={() => setImagePreview(null)}>×</button>
          {previewItem.images.length > 1 ? <button type="button" className="public-collection-lightbox-nav previous" onClick={() => changePreviewImage(-1)} aria-label="Previous photo">‹</button> : null}
          <img className="public-collection-lightbox-image" src={previewImage.publicUrl} alt={`${previewItem.productName}, photo ${(imagePreview.imageIndex ?? 0) + 1}`} />
          {previewItem.images.length > 1 ? <button type="button" className="public-collection-lightbox-nav next" onClick={() => changePreviewImage(1)} aria-label="Next photo">›</button> : null}
          <div className="public-collection-lightbox-caption"><strong>{previewItem.productName}</strong><span>Photo {imagePreview.imageIndex + 1} of {previewItem.images.length}</span><span>Use ← and → to browse · Esc to close</span></div>
        </section>
      </div> : null}
    </main>
  );
}

export default PublicCollectionPage;
