import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/cases/"],
    },
    sitemap: "https://ai-courtroom.vercel.app/sitemap.xml",
  };
}
