import { Router } from "express";
import { getPublishedProductPageSitemapEntries } from "../services/productPages.js";

const router = Router();

const SITE_URL = (
  process.env.PUBLIC_SITE_URL?.trim() || "https://statusfly.com"
).replace(/\/+$/, "");

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

router.get("/", async (_req, res) => {
  try {
    const entries = await getPublishedProductPageSitemapEntries();

    const urls = [
      `
        <url>
          <loc>${escapeXml(`${SITE_URL}/`)}</loc>
        </url>
      `,
      ...entries.map(
        (entry) => `
        <url>
          <loc>${escapeXml(`${SITE_URL}/p/${entry.public_slug}`)}</loc>
          <lastmod>${new Date(entry.updated_at).toISOString()}</lastmod>
        </url>
      `,
      ),
    ].join("");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
>
${urls}
</urlset>`;

    res
      .status(200)
      .type("application/xml")
      .send(xml);
  } catch (error) {
    console.error("Sitemap generation error:", error);

    res.status(500).type("application/xml").send(
      `<?xml version="1.0" encoding="UTF-8"?>
<error>
  <message>Unable to generate sitemap.</message>
</error>`,
    );
  }
});

export default router;