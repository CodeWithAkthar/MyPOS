import { Response } from "express";
import CompanyModel from "../models/company";
import UserModel from "../models/user";
import { RequestWithUser } from "../types/utils";
import { UserRole } from "../types/user";
import { userDataCatch } from "../utils/catch.db";
import { Company } from "../types/company";
import Utils from "../utils";

const utils = new Utils();

export const createCompanyInternal = async (data: Company, userId: string) => {
  data.name = data?.name ? data.name : "My Company";

  // Ensure user doesn't already have a company
  // NEW LOGIC: First 3 letters of name (uppercase) + 4 random numbers
  // Example: KUBABA -> KUB3861
  const prefix = data.name.substring(0, 3).toUpperCase();

  data.companyCode = await utils.generateRandomIdWithValidation({ length: 4, withNumber: true }, async (id) => {
    const code = `${prefix}${id}`;
    const existing = await CompanyModel.findOne({ companyCode: code });
    return !existing; // Allow this ID if no existing company has it (true = allow)
  });
  // Append the prefix to the random ID to form the final code
  data.companyCode = `${prefix}${data.companyCode}`;

  const company = await CompanyModel.create(data);
  await UserModel.findByIdAndUpdate(userId, { companyId: company._id });
  if (userId) userDataCatch.delete(`USER_${userId}`);
  return company;
};

export const createCompany = async (req: RequestWithUser, res: Response) => {
  const { name } = req.body;

  if (!name) throw utils.createError(400, "Company name is required");

  // Check if user already has a company
  if (req.user.companyId) {
    throw utils.createError(400, "User already has a company assigned");
  }

  // Check if user is admin
  if (req.user.role !== UserRole.ADMIN) {
    throw utils.createError(403, "Only admin users can create companies");
  }

  // Create the company
  const company = await createCompanyInternal({ name }, req.user._id as string);

  return {
    message: "Company created successfully",
    company: {
      _id: company._id,
      name: company.name,
      companyCode: company.companyCode,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    },
  };
};

export const getCompany = async (req: RequestWithUser, res: Response) => {
  // If user doesn't have a company, create one automatically
  if (!req.user.companyId) {
    if (req.user.role !== UserRole.ADMIN) {
      throw utils.createError(403, "User must be admin to auto-create company");
    }

    const company = await createCompanyInternal({ name: req.user.name as string }, req.user._id as string);

    return {
      message: "Company auto-created successfully",
      company: {
        _id: company._id,
        name: company.name,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
    };
  }

  let company = await CompanyModel.findById(req.user.companyId);

  if (!company) {
    company = await createCompanyInternal({ name: req.user.name as string }, req.user._id as string);
  }

  return {
    company: {
      _id: company._id,
      name: company.name,
      companyCode: company.companyCode,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    },
  };
};

export const updateCompany = async (req: RequestWithUser, res: Response) => {
  const { name } = req.body;

  if (!name) throw utils.createError(400, "Company name is required");

  // Check if user is admin
  if (req.user.role !== UserRole.ADMIN) {
    throw utils.createError(403, "Only admin users can update companies");
  }

  // If user doesn't have a company, create one
  if (!req.user.companyId) {
    const company = await createCompanyInternal({ name }, req.user._id as string);

    return {
      message: "Company created and updated successfully",
      company: {
        _id: company._id,
        name: company.name,
        createdAt: company.createdAt,
        updatedAt: company.updatedAt,
      },
    };
  }

  let company = await CompanyModel.findByIdAndUpdate(req.user.companyId, { name }, { new: true });

  if (!company) {
    company = await createCompanyInternal({ name: req.user.name as string }, req.user._id as string);
  }

  return {
    message: "Company updated successfully",
    company: {
      _id: company._id,
      name: company.name,
      companyCode: company.companyCode,
      createdAt: company.createdAt,
      updatedAt: company.updatedAt,
    },
  };
};
