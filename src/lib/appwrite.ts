import { Account, Avatars, Client, Functions, Storage, TablesDB } from "appwrite";
import { env } from "./env";

export const client = new Client().setEndpoint(env.endpoint).setProject(env.projectId);

export const account = new Account(client);
export const tables = new TablesDB(client);
export const storage = new Storage(client);
export const functions = new Functions(client);
export const avatars = new Avatars(client);

export { Channel, ID, OAuthProvider, Permission, Query, Role } from "appwrite";
export type { Models } from "appwrite";
