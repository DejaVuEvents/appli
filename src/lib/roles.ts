// Contrôle d'accès par rôle (RBAC).
// Modèle : co_president = accès total. technique = terrain (matériel, prépa, technique,
// événements) mais NI finance NI devis/factures NI clients. membre = accès de base.
import type { RoleMembre } from "@/lib/membre";

/** Zones réservées aux co-présidents (quel que soit le sous-chemin). */
const ZONES_CO_PRESIDENT = ["/finance", "/clients"];
/** Zones accessibles au rôle technique (mais interdites au membre standard). */
const ZONES_TECHNIQUE = ["/catalogue", "/inventaire", "/vehicules", "/planification", "/prestations"];

/**
 * Un rôle peut-il accéder à ce chemin ?
 * Utilisé par le proxy (sécurité serveur) et la navigation (masquage des liens).
 */
export function peutAcceder(role: RoleMembre, pathname: string): boolean {
  if (role === "co_president") return true;

  // --- Réservé co-présidents ---
  // Liste des devis & factures (chemin exact /prestations, pas les détails d'événement)
  if (pathname === "/prestations" || pathname.startsWith("/prestations?")) return false;
  // Édition/émission de documents (PDF devis & factures)
  if (pathname.includes("/document")) return false;
  if (ZONES_CO_PRESIDENT.some((z) => pathname === z || pathname.startsWith(z + "/") || pathname.startsWith(z + "?"))) return false;

  // --- Zones "technique" (interdites au membre standard) ---
  for (const z of ZONES_TECHNIQUE) {
    if (pathname === z || pathname.startsWith(z + "/") || pathname.startsWith(z + "?")) {
      return role === "technique";
    }
  }

  // --- Reste : accessible à tous les rôles connectés ---
  // (Accueil, Calendrier, Réunions, Avancement, Équipe, Notes de frais, Paramètres/profil)
  return true;
}

/** Onglets sensibles de Paramètres réservés aux co-présidents. */
export function peutGererParametres(role: RoleMembre): boolean {
  return role === "co_president";
}

/**
 * Rôles possibles pour une personne affectée à un événement (plusieurs cumulables).
 * Distinct du rôle RBAC (`RoleMembre` dans `@/lib/membre`).
 */
export const ROLES_MEMBRE = ["Lead", "Opérateur", "Technicien"] as const;
