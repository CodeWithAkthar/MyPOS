// Extend Express Request type and global declarations
declare global {
  // Express Request extension for distributed tracing
  namespace Express {
    interface Request {
      requestId: string;
    }
  }

  // Global config and utils
  const config: ReturnType<import("../config").default>;
  const utils: import("../utils/index").default;

  // Application configuration interface
  interface Configs {
    server: {
      name: string;
      id: string;
      instanceId: string;
      port: number;
      baseUrl: string;
      isProduction: boolean;
      nodeEnv?: string;
      shutdownTimeoutMs: number;
      logFormat: "dev" | "json" | "auto";
    };
    mongodb: {
      url: string;
    };
    jwt: {
      accessTokenSecret: string;
    };
    cors: import("cors").CorsOptions;
    pagination: {
      defaultPage: number;
      defaultPageSize: number;
      maxPageSize: number;
    };
    s3: {
      region: string;
      bucket: string;
      accessKeyId: string;
      secretAccessKey: string;
      publicBaseUrl: string;
    };
  }
}

export {};
