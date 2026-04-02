import { User } from "../types/user";

// User data cache
// const catchKey = `USER_${payload?.uid}`;
// USER_<user-id> => USER_345n345345345lj34l53
export const userDataCatch = new Map<string, User | null>();

// Blocklist caches for inactive entities
// When an entity (company/brand/outlet) is marked inactive, its ID is added to the respective Set
// This allows instant rejection without database queries
export const blockedCompanies = new Set<string>();
export const blockedBrands = new Set<string>();
export const blockedOutlets = new Set<string>();
