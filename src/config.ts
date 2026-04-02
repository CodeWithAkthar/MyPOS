import dotenv from "dotenv";
dotenv.config({ quiet: true });

function getConfig() {
  const configs: Configs = {
    server: {
      name: process.env.SERVER_NAME || "pos-backend",
      id: process.env.SERVER_ID || "1",
      instanceId: process.env.pm_id || process.env.NODE_APP_INSTANCE || process.env.INSTANCE_ID || "0",
      port: Number(process.env.PORT) || 5500,
      baseUrl: "/",
      isProduction: process.env.NODE_ENV == "PRODUCTION",
      nodeEnv: process.env.NODE_ENV || "DEV",
      shutdownTimeoutMs: Number(process.env.SHUTDOWN_TIMEOUT_MS) || 10000,
      logFormat: (process.env.LOG_FORMAT as "dev" | "json" | "auto") || "auto",
    },
    mongodb: {
      url: process.env.MONGODB_URL || "mongodb://localhost:27017/pos-backend",
      // db: process.env.MONGODB_DB || "pos-backend",
    },
    jwt: {
      accessTokenSecret: process.env.ACCESS_TOKEN_SECRET || "abfdc3843b403caf14cd1fe07658f7eb3c25be56",
    },
    cors: {
      origin: ["https://r2.mastrovia.com", "https://pos-backend.mastrovia.com"],
      credentials: true,
    },
    pagination: {
      defaultPage: Number(process.env.DEFAULT_PAGE) || 1,
      defaultPageSize: Number(process.env.DEFAULT_PAGE_SIZE) || 20,
      maxPageSize: Number(process.env.MAX_PAGE_SIZE) || 100,
    },
    s3: {
      region: process.env.S3_REGION || "ap-south-1",
      bucket: process.env.S3_BUCKET || "",
      accessKeyId: process.env.S3_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID || "",
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY || "",
      publicBaseUrl:
        process.env.S3_PUBLIC_BASE_URL ||
        (process.env.S3_BUCKET ? `https://${process.env.S3_BUCKET}.s3.${process.env.S3_REGION || "ap-south-1"}.amazonaws.com` : ""),
    },
  };

  return configs;
}

type getConfig = typeof getConfig;
export default getConfig;
