import { ActiveStatus } from "../types/brand";
import { OrderFieldRequirement, OrderTypeKey } from "../types/orderType";

export function isValidOrderTypeKey(value: string): value is OrderTypeKey {
  return Object.values(OrderTypeKey).includes((value + "").toLowerCase() as OrderTypeKey);
}

export function isValidOrderFieldRequirement(value: string | undefined): value is OrderFieldRequirement {
  if (!value) return false as any;
  return Object.values(OrderFieldRequirement).includes((value + "").toLowerCase() as OrderFieldRequirement);
}

export function isValidActiveStatus(value: string | undefined): value is ActiveStatus {
  if (!value) return false as any;
  return Object.values(ActiveStatus).includes((value + "").toLowerCase() as ActiveStatus);
}


