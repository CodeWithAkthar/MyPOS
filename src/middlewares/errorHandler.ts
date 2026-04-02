import logger from "../services/logger.service";

// Error type from Utils.createError
interface AppError {
  status?: number;
  message?: string;
  data?: object | null;
}

// Error handling middleware
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function errorHandlingMiddleware(err: AppError, req: any, res: any, __: any) {
  // Check if the error has a status code and error message
  const status = err.status || 500;
  const errorMessage = err.message || (status == 500 ? "Internal Server Error" : "Oops something went wrong");

  // Check if there is additional data in the error object
  const additionalData = err.data || null;

  // Log the error using Winston with context
  if (status >= 500) {
    logger.error(errorMessage, {
      status,
      path: req.path,
      method: req.method,
      error: additionalData,
    });
  } else if (status >= 400) {
    logger.warn(errorMessage, {
      status,
      path: req.path,
      method: req.method,
    });
  }

  // Respond with the appropriate status code and error message
  res.status(status).json({ status: status, message: errorMessage, data: additionalData });
}
