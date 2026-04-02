import { trace, context, SpanStatusCode, type Span } from "@opentelemetry/api";
import type { Schema, Query, Document } from "mongoose";

const tracer = trace.getTracer("mongoose-tracer");

// Extend Query type to include our span
interface TracedQuery extends Query<any, any> {
  __otelSpan?: Span;
}

export function mongooseTracePlugin(schema: Schema) {
  // All Mongoose operations we want to trace
  const ops = [
    "find",
    "findOne",
    "findOneAndUpdate",
    "findOneAndDelete",
    "findOneAndReplace",
    "updateOne",
    "updateMany",
    "deleteOne",
    "deleteMany",
    "save",
    "insertMany",
    "countDocuments",
    "estimatedDocumentCount",
    "aggregate",
    "distinct",
  ];

  ops.forEach((op) => {
    // Pre-hook: Start span before operation
    schema.pre(op, function (this: TracedQuery) {
      const span = tracer.startSpan(
        `mongoose.${op}`,
        {
          attributes: {
            "db.system": "mongodb",
            "db.operation": op,
            "db.collection": this.model?.collection?.name || "unknown",
            // Optionally add query details (be careful with PII)
            // "db.query": JSON.stringify(this.getQuery()),
          },
        },
        context.active(),
      );

      this.__otelSpan = span;
    });

    // Post-hook: End span on success
    schema.post(op, function (this: TracedQuery, _res: any, next: () => void) {
      const span = this.__otelSpan;
      if (span) {
        span.setStatus({ code: SpanStatusCode.OK });
        span.end();
      }
      next();
    });

    // Error hook: Record exception and end span
    schema.post(op, function (this: TracedQuery, err: Error, _res: any, next: (err?: Error) => void) {
      const span = this.__otelSpan;
      if (span && err) {
        span.recordException(err);
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: err.message,
        });
        span.end();
      }
      next(err);
    });
  });

  // Special handling for 'save' on document instances
  schema.pre("save", function (this: Document & { __otelSpan?: Span }) {
    const span = tracer.startSpan(
      "mongoose.save",
      {
        attributes: {
          "db.system": "mongodb",
          "db.operation": "save",
          "db.collection": this.constructor.modelName || "unknown",
        },
      },
      context.active(),
    );
    this.__otelSpan = span;
  });

  schema.post("save", function (this: Document & { __otelSpan?: Span }, _doc: any, next: () => void) {
    const span = this.__otelSpan;
    if (span) {
      span.setStatus({ code: SpanStatusCode.OK });
      span.end();
    }
    next();
  });
}
