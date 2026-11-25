import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/login", "/signup"],
      disallow: [
        "/api/",
        "/account",
        "/settings",
        "/deposit",
        "/withdraw",
        "/payments/",
      ],
    },
    sitemap: "https://music.404hz.me/sitemap.xml",
  };
}
