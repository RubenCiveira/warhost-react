import { ID, Permission, Query, Role, tables } from "../lib/appwrite";
import { TABLES, env } from "../lib/env";
import { slugify } from "../lib/format";
import type { Association, AssociationMember, MemberRole } from "../lib/types";

const ACCEPTED = Role.label("aceptado");

export async function listAssociations(): Promise<Association[]> {
  const result = await tables.listRows<Association>({
    databaseId: env.databaseId,
    tableId: TABLES.associations,
    queries: [Query.orderAsc("name"), Query.limit(100)],
  });
  return result.rows;
}

export async function getAssociation(associationId: string): Promise<Association> {
  return tables.getRow<Association>({
    databaseId: env.databaseId,
    tableId: TABLES.associations,
    rowId: associationId,
  });
}

export async function createAssociation(
  ownerId: string,
  ownerName: string,
  input: { name: string; description?: string; city?: string; visibility?: "public" | "private" },
): Promise<Association> {
  const association = await tables.createRow<Association>({
    databaseId: env.databaseId,
    tableId: TABLES.associations,
    rowId: ID.unique(),
    data: {
      name: input.name.trim(),
      slug: `${slugify(input.name)}-${Math.random().toString(36).slice(2, 6)}`,
      ownerId,
      description: input.description?.trim() || null,
      city: input.city?.trim() || null,
      visibility: input.visibility ?? "public",
      createdAt: new Date().toISOString(),
    },
    permissions: [
      Permission.read(ACCEPTED),
      Permission.update(Role.user(ownerId)),
      Permission.delete(Role.user(ownerId)),
    ],
  });

  await addMember(association.$id, ownerId, ownerName, "owner", ownerId);
  return association;
}

export async function updateAssociation(
  associationId: string,
  input: Partial<Pick<Association, "name" | "description" | "city" | "visibility">>,
): Promise<Association> {
  return tables.updateRow<Association>({
    databaseId: env.databaseId,
    tableId: TABLES.associations,
    rowId: associationId,
    data: input,
  });
}

export async function deleteAssociation(associationId: string): Promise<void> {
  const members = await listMembers(associationId);
  await Promise.all(
    members.map((member) =>
      tables.deleteRow({ databaseId: env.databaseId, tableId: TABLES.associationMembers, rowId: member.$id }),
    ),
  );
  await tables.deleteRow({ databaseId: env.databaseId, tableId: TABLES.associations, rowId: associationId });
}

export async function listMembers(associationId: string): Promise<AssociationMember[]> {
  const result = await tables.listRows<AssociationMember>({
    databaseId: env.databaseId,
    tableId: TABLES.associationMembers,
    queries: [Query.equal("associationId", associationId), Query.orderAsc("joinedAt"), Query.limit(200)],
  });
  return result.rows;
}

export async function listMyMemberships(userId: string): Promise<AssociationMember[]> {
  const result = await tables.listRows<AssociationMember>({
    databaseId: env.databaseId,
    tableId: TABLES.associationMembers,
    queries: [Query.equal("userId", userId), Query.limit(100)],
  });
  return result.rows;
}

/**
 * `managerId` es quien podra editar y borrar la fila. Al unirse uno mismo es el
 * propio usuario; al invitar, el dueno de la asociacion.
 */
export async function addMember(
  associationId: string,
  userId: string,
  displayName: string,
  role: MemberRole,
  managerId: string,
): Promise<AssociationMember> {
  return tables.createRow<AssociationMember>({
    databaseId: env.databaseId,
    tableId: TABLES.associationMembers,
    rowId: ID.unique(),
    data: {
      associationId,
      userId,
      displayName,
      role,
      joinedAt: new Date().toISOString(),
    },
    permissions: [
      Permission.read(ACCEPTED),
      Permission.update(Role.user(managerId)),
      Permission.delete(Role.user(managerId)),
      ...(managerId === userId ? [] : [Permission.delete(Role.user(userId))]),
    ],
  });
}

export async function removeMember(memberId: string): Promise<void> {
  await tables.deleteRow({ databaseId: env.databaseId, tableId: TABLES.associationMembers, rowId: memberId });
}
