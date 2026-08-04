import type { NextConfig } from "next";

// En-têtes de sécurité HTTP appliqués à toutes les réponses (défense en profondeur).
const securityHeaders = [
  // Empêche l'affichage du site dans une iframe d'un autre domaine (anti-clickjacking).
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  // Empêche le navigateur de « deviner » le type MIME (anti-injection).
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Ne fuite pas l'URL complète vers les sites externes.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Restreint les API sensibles : caméra autorisée (scan QR), micro/géoloc bloqués.
  { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
  // Force HTTPS pendant 2 ans (ignoré en local http, actif sur Vercel).
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  // @react-pdf/renderer doit rester externe au bundle serveur (sinon erreurs de build).
  serverExternalPackages: ["@react-pdf/renderer"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
