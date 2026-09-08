function required(name: string, value: string | undefined): string {
  if (!value) throw new Error(`Falta la variable de entorno ${name}. Copia .env.example a .env.`);
  return value;
}

export const env = {
  endpoint: required("VITE_APPWRITE_ENDPOINT", import.meta.env.VITE_APPWRITE_ENDPOINT),
  projectId: required("VITE_APPWRITE_PROJECT_ID", import.meta.env.VITE_APPWRITE_PROJECT_ID),
  databaseId: import.meta.env.VITE_APPWRITE_DATABASE_ID ?? "warhost",
  bucketId: import.meta.env.VITE_APPWRITE_BUCKET_ID ?? "army_assets",
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
} as const;

/** Label que un admin concede en Appwrite para dar acceso a los datos. */
export const ACCEPTED_LABEL = "aceptado";
