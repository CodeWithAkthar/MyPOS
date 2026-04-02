import jwt from "jsonwebtoken";

export const createJwtByUserId = (userId: string) => {
  return jwt.sign({ uid: userId }, config.jwt.accessTokenSecret);
};

export const createJwt = (payload: any) => {
  return jwt.sign(payload, config.jwt.accessTokenSecret, {
    expiresIn: "360d",
  });
};

export const verifyJwt = (jwtToken: any): any => {
  return jwt.verify(jwtToken, config.jwt.accessTokenSecret);
};

export default {
  createJwt,
  createJwtByUserId,
  verifyJwt,
};
