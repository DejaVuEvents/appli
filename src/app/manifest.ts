import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Déjà Vu — Gestion",
    short_name: "Déjà Vu",
    description:
      "Gestion intégrée : catalogue matériel, devis, préparation, inventaire, trésorerie.",
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7f9",
    theme_color: "#6d28d9",
    lang: "fr",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
