function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Falta la variable de entorno ${name}. Copia .env.example a .env.`);
  return value;
}

export const env = {
  endpoint: required("VITE_APPWRITE_ENDPOINT", import.meta.env.VITE_APPWRITE_ENDPOINT),
  projectId: required("VITE_APPWRITE_PROJECT_ID", import.meta.env.VITE_APPWRITE_PROJECT_ID),
  databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID ?? "warhost",
  bucketId: import.meta.env.VITE_APPWRITE_BUCKET_ID ?? "army_assets",
  catalogBucketId: import.meta.env.VITE_APPWRITE_CATALOG_BUCKET_ID ?? "catalog_assets",
  notifyFunctionId: import.meta.env.VITE_APPWRITE_NOTIFY_FUNCTION_ID ?? "notify_verified_user",
  armyForgeFunctionId: import.meta.env.VITE_APPWRITE_ARMY_FORGE_FUNCTION_ID ?? "army_forge_proxy",
} as const;

export const TABLES = {
  armies: "armies",
  associations: "associations",
  associationMembers: "association_members",
  games: "games",
  gamePlayers: "game_players",
  gameUnits: "game_units",
  rules: "rules",
  missions: "missions",
  heroClasses: "hero_classes",
  armyBooks: "army_books",
  armyUnits: "army_units",
  armyUpgradePackages: "army_upgrade_packages",
  armyRules: "army_rules",
  catalogImages: "catalog_images",
} as const;

/** Label que un admin concede en Appwrite para dar acceso a los datos. */
export const ACCEPTED_LABEL = "aceptado";

/** Label que permite mantener el catalogo: imagenes de facciones y unidades. */
export const ADMIN_LABEL = "admin";
/** Mantiene el contenido que se transcribe a mano: de momento, las misiones. */
export const EDITOR_LABEL = "editor";
