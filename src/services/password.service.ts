import bcrypt from "bcryptjs";

export const createHash = (password: string): string => {
  return bcrypt.hashSync(password, 10);
};

export const verifyHash = (password: string, hash: string): boolean => {
  return bcrypt.compareSync(password, hash);
};

export default {
  createHash,
  verifyHash,
};
