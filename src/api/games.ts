import { Channel, ID, Permission, Query, Role, client, tables } from "../lib/appwrite";
import { TABLES, env } from "../lib/env";
import type { GameSystemId, Setting } from "../lib/gameSystems";
import type { Game, GamePlayer, GameResult, GameUnit } from "../lib/types";

const ACCEPTED = Role.label("aceptado");

/** Las partidas son colaborativas: cualquier aceptado puede leerlas y actualizarlas. */
const SHARED_PERMISSIONS = [Permission.read(ACCEPTED), Permission.update(ACCEPTED), Permission.delete(ACCEPTED)];

export interface GameDraft {
  name: string;
  setting: Setting;
  gameSystem: GameSystemId;
  associationId?: string | null;
  missionId?: string | null;
  missionName?: string | null;
  pointsLimit?: number;
  notes?: string | null;
}

export async function listGames(options: {
  gameSystem?: GameSystemId;
  associationId?: string;
  status?: Game["status"];
  limit?: number;
} = {}): Promise<Game[]> {
  const queries = [Query.orderDesc("$createdAt"), Query.limit(options.limit ?? 50)];
  if (options.gameSystem) queries.push(Query.equal("gameSystem", options.gameSystem));
  if (options.associationId) queries.push(Query.equal("associationId", options.associationId));
  if (options.status) queries.push(Query.equal("status", options.status));

  const result = await tables.listRows<Game>({ databaseId: env.databaseId, tableId: TABLES.games, queries });
  return result.rows;
}

export async function getGame(gameId: string): Promise<Game> {
  return tables.getRow<Game>({ databaseId: env.databaseId, tableId: TABLES.games, rowId: gameId });
}

export async function createGame(createdBy: string, draft: GameDraft): Promise<Game> {
  return tables.createRow<Game>({
    databaseId: env.databaseId,
    tableId: TABLES.games,
    rowId: ID.unique(),
    data: {
      name: draft.name.trim(),
      setting: draft.setting,
      gameSystem: draft.gameSystem,
      associationId: draft.associationId ?? null,
      missionId: draft.missionId ?? null,
      missionName: draft.missionName ?? null,
      pointsLimit: draft.pointsLimit ?? 0,
      notes: draft.notes ?? null,
      status: "setup",
      round: 0,
      activePlayerId: null,
      createdBy,
      startedAt: null,
      endedAt: null,
    },
    permissions: SHARED_PERMISSIONS,
  });
}

export async function updateGame(gameId: string, data: Partial<Game>): Promise<Game> {
  return tables.updateRow<Game>({ databaseId: env.databaseId, tableId: TABLES.games, rowId: gameId, data });
}

export async function startGame(gameId: string): Promise<Game> {
  return updateGame(gameId, { status: "active", round: 1, startedAt: new Date().toISOString() });
}

export async function nextRound(game: Game): Promise<Game> {
  const players = await listPlayers(game.$id);
  await Promise.all(
    players.map(async (player) => {
      const units = await listUnits(game.$id, player.$id);
      await Promise.all(
        units
          .filter((unit) => unit.activated || unit.fatigued)
          .map((unit) => updateUnit(unit.$id, { activated: false, fatigued: false })),
      );
    }),
  );
  return updateGame(game.$id, { round: game.round + 1 });
}

export async function finishGame(gameId: string, results: Record<string, GameResult>): Promise<Game> {
  await Promise.all(
    Object.entries(results).map(([playerId, result]) => updatePlayer(playerId, { result })),
  );
  return updateGame(gameId, { status: "finished", endedAt: new Date().toISOString() });
}

export async function deleteGame(gameId: string): Promise<void> {
  const [players, units] = await Promise.all([listPlayers(gameId), listUnits(gameId)]);
  await Promise.all(units.map((unit) => deleteUnit(unit.$id)));
  await Promise.all(players.map((player) => deletePlayer(player.$id)));
  await tables.deleteRow({ databaseId: env.databaseId, tableId: TABLES.games, rowId: gameId });
}

export async function listPlayers(gameId: string): Promise<GamePlayer[]> {
  const result = await tables.listRows<GamePlayer>({
    databaseId: env.databaseId,
    tableId: TABLES.gamePlayers,
    queries: [Query.equal("gameId", gameId), Query.orderAsc("$createdAt"), Query.limit(20)],
  });
  return result.rows;
}

export async function listPlayerHistory(userId: string, limit = 100): Promise<GamePlayer[]> {
  const result = await tables.listRows<GamePlayer>({
    databaseId: env.databaseId,
    tableId: TABLES.gamePlayers,
    queries: [Query.equal("userId", userId), Query.orderDesc("$createdAt"), Query.limit(limit)],
  });
  return result.rows;
}

export async function addPlayer(
  gameId: string,
  data: Partial<GamePlayer> & { displayName: string },
): Promise<GamePlayer> {
  return tables.createRow<GamePlayer>({
    databaseId: env.databaseId,
    tableId: TABLES.gamePlayers,
    rowId: ID.unique(),
    data: {
      gameId,
      userId: data.userId ?? null,
      displayName: data.displayName,
      armyId: data.armyId ?? null,
      armyName: data.armyName ?? null,
      faction: data.faction ?? null,
      points: data.points ?? 0,
      score: 0,
      victoryPoints: 0,
      commandPoints: 0,
      result: null,
      color: data.color ?? null,
    },
    permissions: SHARED_PERMISSIONS,
  });
}

export async function updatePlayer(playerId: string, data: Partial<GamePlayer>): Promise<GamePlayer> {
  return tables.updateRow<GamePlayer>({
    databaseId: env.databaseId,
    tableId: TABLES.gamePlayers,
    rowId: playerId,
    data,
  });
}

export async function deletePlayer(playerId: string): Promise<void> {
  await tables.deleteRow({ databaseId: env.databaseId, tableId: TABLES.gamePlayers, rowId: playerId });
}

export async function listUnits(gameId: string, playerId?: string): Promise<GameUnit[]> {
  const queries = [Query.equal("gameId", gameId), Query.orderAsc("sortOrder"), Query.limit(200)];
  if (playerId) queries.push(Query.equal("playerId", playerId));

  const result = await tables.listRows<GameUnit>({
    databaseId: env.databaseId,
    tableId: TABLES.gameUnits,
    queries,
  });
  return result.rows;
}

export type UnitDraft = Pick<GameUnit, "name" | "size" | "quality" | "defense" | "maxWounds" | "rules" | "sortOrder"> &
  Partial<Pick<GameUnit, "unitKey">>;

export async function addUnits(gameId: string, playerId: string, drafts: UnitDraft[]): Promise<GameUnit[]> {
  return Promise.all(
    drafts.map((draft) =>
      tables.createRow<GameUnit>({
        databaseId: env.databaseId,
        tableId: TABLES.gameUnits,
        rowId: ID.unique(),
        data: {
          gameId,
          playerId,
          name: draft.name,
          unitKey: draft.unitKey ?? null,
          size: draft.size,
          quality: draft.quality,
          defense: draft.defense,
          wounds: 0,
          maxWounds: draft.maxWounds,
          state: "ready",
          activated: false,
          shaken: false,
          fatigued: false,
          destroyed: false,
          tokens: null,
          rules: draft.rules,
          sortOrder: draft.sortOrder,
        },
        permissions: SHARED_PERMISSIONS,
      }),
    ),
  );
}

export async function updateUnit(unitId: string, data: Partial<GameUnit>): Promise<GameUnit> {
  return tables.updateRow<GameUnit>({
    databaseId: env.databaseId,
    tableId: TABLES.gameUnits,
    rowId: unitId,
    data,
  });
}

export async function deleteUnit(unitId: string): Promise<void> {
  await tables.deleteRow({ databaseId: env.databaseId, tableId: TABLES.gameUnits, rowId: unitId });
}

/**
 * Escucha en tiempo real los cambios de una partida y de sus jugadores y unidades,
 * para que todos los que tengan la partida abierta vean los mismos marcadores.
 */
export function subscribeToGame(gameId: string, onChange: () => void): () => void {
  const db = Channel.tablesdb(env.databaseId);
  return client.subscribe(
    [
      db.table(TABLES.games).row(gameId),
      db.table(TABLES.gamePlayers).row(),
      db.table(TABLES.gameUnits).row(),
    ],
    (event) => {
      const payload = event.payload as { gameId?: string } | undefined;
      // Los canales de jugadores y unidades son de toda la tabla: descartamos
      // los eventos que no son de esta partida.
      if (payload?.gameId && payload.gameId !== gameId) return;
      onChange();
    },
  );
}
