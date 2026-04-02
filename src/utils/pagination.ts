import { Request } from "express";

export type PaginationParams = {
  page: number;
  limit: number;
  skip: number;
};

export function getPaginationParams(req: Request): PaginationParams {
  const rawPage = Number((req.query as any).page) || config.pagination.defaultPage;
  const rawLimit = Number((req.query as any).limit) || config.pagination.defaultPageSize;

  const page = rawPage < 1 ? 1 : rawPage;
  const max = config.pagination.maxPageSize;
  const limit = rawLimit < 1 ? config.pagination.defaultPageSize : rawLimit > max ? max : rawLimit;

  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function buildPagedResponse<T>(items: T[], page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    data: items,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage: page < totalPages,
      hasPrevPage: page > 1,
    },
  };
}


