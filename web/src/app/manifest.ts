import type { MetadataRoute } from "next";

/** Lets phones install Financer to the home screen with its own icon and name. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Financer",
    short_name: "Financer",
    description: "Uangmu, tujuanmu, masa depanmu.",
    lang: "id",
    start_url: "/beranda",
    scope: "/",
    display: "standalone",
    background_color: "#F5F6F2",
    theme_color: "#047857",
    icons: [
      { src: "/brand/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/brand/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/brand/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
