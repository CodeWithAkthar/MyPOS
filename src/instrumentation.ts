/*instrumentation.ts*/
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";
import { WinstonInstrumentation } from "@opentelemetry/instrumentation-winston";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

// Import the SDK logs package to access BatchLogRecordProcessor implementation
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { resourceFromAttributes } from "@opentelemetry/resources";

const traceExporter = new OTLPTraceExporter({
  url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ? `${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces` : "http://localhost:4318/v1/traces",
});

const logExporter = new OTLPLogExporter({
  url: process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT
    ? `${process.env.OTEL_EXPORTER_OTLP_LOGS_ENDPOINT}/v1/logs`
    : "http://localhost:4318/v1/logs",
});

// Create resource with service name
const resource = resourceFromAttributes({
  [ATTR_SERVICE_NAME]: process.env.OTEL_SERVICE_NAME || "my-express",
});

// Create the log processor instance
const logRecordProcessor = new BatchLogRecordProcessor(logExporter);

// --- START SDK CONFIGURATION ---

const sdk = new NodeSDK({
  resource,
  traceExporter: traceExporter,
  // Pass the logRecordProcessor directly to the SDK configuration:
  logRecordProcessor: logRecordProcessor,

  // metricReader: new PeriodicExportingMetricReader({
  //   exporter: new ConsoleMetricExporter(),
  // }),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-mongodb": {
        enhancedDatabaseReporting: true,
      },
    }),
    new WinstonInstrumentation({
      logHook: (span, record) => {
        record["resource.service.name"] = process.env.OTEL_SERVICE_NAME || "my-express";
      },
    }),
  ],
});

// The NodeSDK manages creating the LoggerProvider internally and registers it globally upon starting the SDK.
// You no longer need the manual steps that were causing the "undefined" error:
/*
// Initialize Logger Provider
const loggerProvider = new LoggerProvider({ resource });
loggerProvider.addLogRecordProcessor(new BatchLogRecordProcessor(logExporter));
logs.setGlobalLoggerProvider(loggerProvider);
*/

// Start the SDK
try {
  sdk.start();
  console.log("OpenTelemetry instrumentation initialized successfully");
} catch (error) {
  console.error("Error initializing OpenTelemetry:", error);
}

// Handle graceful shutdown
process.on("SIGTERM", () => {
  sdk
    .shutdown()
    .then(() => console.log("OpenTelemetry SDK shut down successfully"))
    .catch((error) => console.error("Error shutting down OpenTelemetry:", error))
    .finally(() => process.exit(0));
});

// We can no longer export loggerProvider directly in this way,
// but you can get the global provider anywhere else in your app via `logs.getLoggerProvider()`
// export { loggerProvider };
