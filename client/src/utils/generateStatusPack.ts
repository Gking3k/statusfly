import { toPng } from "html-to-image";
import JSZip from "jszip";

const EXPORT_WIDTH = 1080;
const EXPORT_HEIGHT = 1920;
const EXPORT_LOGICAL_WIDTH = 360;
const EXPORT_LOGICAL_HEIGHT = 640;
const EXPORT_PIXEL_RATIO = 3;

const slideNames = [
  "hook",
  "product",
  "why-it",
  "price",
  "order",
] as const;

function slugify(value: string) {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "product"
  );
}

async function waitForImages(node: HTMLElement) {
  const images = Array.from(node.querySelectorAll("img"));

  await Promise.all(
    images.map(async (image) => {
      if (!image.complete) {
        await new Promise<void>((resolve, reject) => {
          const handleLoad = () => {
            cleanup();
            resolve();
          };

          const handleError = () => {
            cleanup();
            reject(new Error("The product image could not be loaded for export."));
          };

          const cleanup = () => {
            image.removeEventListener("load", handleLoad);
            image.removeEventListener("error", handleError);
          };

          image.addEventListener("load", handleLoad, { once: true });
          image.addEventListener("error", handleError, { once: true });
        });
      }

      if (image.naturalWidth === 0 || image.naturalHeight === 0) {
        throw new Error("The product image could not be prepared for export.");
      }

      if (typeof image.decode === "function") {
        try {
          await image.decode();
        } catch {
          // Some browsers can report a decode error even when the image is drawable.
        }
      }
    }),
  );
}

async function renderSlide(node: HTMLElement) {
  if (document.fonts?.ready) {
    await document.fonts.ready;
  }

  await waitForImages(node);

  return toPng(node, {
    cacheBust: false,
    pixelRatio: EXPORT_PIXEL_RATIO,
    width: EXPORT_LOGICAL_WIDTH,
    height: EXPORT_LOGICAL_HEIGHT,
    style: {
      width: `${EXPORT_LOGICAL_WIDTH}px`,
      height: `${EXPORT_LOGICAL_HEIGHT}px`,
      animation: "none",
      transition: "none",
    },
  });
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");

  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();

  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function dataUrlToBlob(dataUrl: string) {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function downloadSlide(
  node: HTMLElement,
  productName: string,
  slideIndex: number,
) {
  const dataUrl = await renderSlide(node);
  const filename = `statusfly-${String(slideIndex + 1).padStart(2, "0")}-${slideNames[slideIndex]}-${slugify(productName)}.png`;
  const blob = await dataUrlToBlob(dataUrl);

  triggerDownload(blob, filename);
}

export async function downloadStatusPack(
  nodes: HTMLElement[],
  productName: string,
) {
  if (nodes.length !== slideNames.length) {
    throw new Error("StatusFly needs exactly five slides to create a pack.");
  }

  const images = await Promise.all(nodes.map(renderSlide));
  const zip = new JSZip();
  const slug = slugify(productName);

  images.forEach((dataUrl, index) => {
    const base64 = dataUrl.split(",")[1];

    if (!base64) {
      throw new Error("Unable to prepare one of the generated slides.");
    }

    zip.file(
      `statusfly-${String(index + 1).padStart(2, "0")}-${slideNames[index]}-${slug}.png`,
      base64,
      { base64: true },
    );
  });

  const zipBlob = await zip.generateAsync({ type: "blob" });
  triggerDownload(zipBlob, `statusfly-pack-${slug}.zip`);

  return {
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
  };
}
