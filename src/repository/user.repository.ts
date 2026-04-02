import mongoose from "mongoose";
import UserModel from "../models/user";
import { User } from "../types/user";

const defaultAvoidProject = {
  password: 0,
  __v: 0,
};

type DefaultQueryInclude = {
  companyId: string;
};

const userDataCatch = new Map<string, User | null>();

export async function getById(userId: string): Promise<User | null> {
  const catchKey = userId + "";
  if (userDataCatch.has(catchKey)) return userDataCatch.get(catchKey) || null;
  const userData = await UserModel.findOne({ _id: userId }, defaultAvoidProject);
  userDataCatch.set(catchKey, userData);
  return userData;
}

export async function getByEmail(email: string): Promise<User | null> {
  const catchKey = email + "";
  if (userDataCatch.has(catchKey)) return userDataCatch.get(catchKey) || null;
  const userData = await UserModel.findOne({ email: email }, defaultAvoidProject);
  userDataCatch.set(catchKey, userData);
  return userData;
}

export async function getByIdRaw(userId: string): Promise<User | null> {
  return UserModel.findOne({ _id: userId });
}

export async function getByEmailRaw(email: string): Promise<User | null> {
  return UserModel.findOne({ email: email });
}

export async function getAll(filter: DefaultQueryInclude): Promise<User[]> {
  (filter as any).companyId = new mongoose.Types.ObjectId(filter.companyId);
  return UserModel.find(filter, defaultAvoidProject);
}

export async function create(data: User): Promise<User> {
  const user = new UserModel(data);
  await user.save();
  return user;
}

const userRepository = {
  getById,
  getByEmail,
  getByIdRaw,
  getByEmailRaw,
  getAll,
  create,
};

export default userRepository;
