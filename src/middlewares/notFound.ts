/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Error Handler for not found 404
 * @param req Express Request
 * @param res Express Response
 */
export default function notFoundMiddleware(_: any, res: any) {
  res.status(404);
  res.send(utils.createError(404, "The service you are looking for is not on this server"));
}
