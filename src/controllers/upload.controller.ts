import { Response } from "express";
import { RequestWithUser } from "../types/utils";
import Utils from "../utils";
import { createUploadUrl } from "../services/s3.service";

const utils = new Utils();

export const getUploadUrl = async (req: RequestWithUser, res: Response) => {
  if (!req.user.companyId) throw utils.createError(400, "User must have a company");

  const { contentType, filename, prefix } = req.query as any;
  if (!filename) throw utils.createError(400, "filename is required");
  if (!contentType) throw utils.createError(400, "contentType is required");

  const result = await createUploadUrl({ contentType, filename, prefix });
  return result;
};
