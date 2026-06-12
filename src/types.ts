/** Severity levels. Internal to the library: call sites never pick CRITICAL/IMPORTANT directly — the policy does. */
export type LogImportance = "CRITICAL" | "IMPORTANT" | "INFO" | "DEBUG";

/**
 * Structured payload for every log entry.
 *
 * Searchable dimensions (`hospitalId`, `scope`) become Sentry tags on capture;
 * everything else travels as extras/console output.
 */
export interface LoggerMessageI {
  /** Tenant identifier. Becomes the indexable `hospital.id` Sentry tag — include it whenever available. */
  hospitalId?: string;
  /** Acting user, for traceability. Travels as a Sentry extra. */
  userId?: string;
  /**
   * Event name. Keep it SHORT and STABLE (e.g. `"no_hospital_mapping"`):
   * Sentry groups issues by it. Variable data (ids, accounts) belongs in
   * `description`/`extra`, never here.
   */
  title: string;
  /** Human-readable detail. Free-form; variable data goes here. */
  description?: string;
  /** Stack trace. Auto-filled by `Logger.report()` from the error when omitted. */
  stack?: string;
  /** Arbitrary structured detail. Serialized defensively with `safeStringify` (circular-safe). */
  extra?: unknown;
  /** Origin class/module, set automatically by `Logger.scope()`. Becomes the indexable `scope` Sentry tag. */
  scope?: string;
}

/**
 * Context for notification-pipeline failures (`Logger.reportPipeline`).
 *
 * `module` and `channel` are REQUIRED by design: they become the Sentry tags
 * that dashboards and alert rules slice by — the type system guarantees no
 * pipeline error ships without its dimensions.
 */
export interface PipelineCtxI {
  /** Consumer vocabulary (e.g. in OCA: `"appointment" | "prescription" | ...`). Becomes the `module` tag. */
  module: string;
  /** Delivery channel (e.g. `"WHATSAPP" | "EMAIL" | "SMS"`). Becomes the `channel` tag. */
  channel: string;
  /** Notification type (e.g. `"REMINDER"`). Becomes the `notification_type` tag when present. */
  type?: string;
  /** Tenant identifier. Becomes the `hospital.id` tag and the Sentry user. */
  hospitalId?: string;
  /** Notification row id — the pointer back to the consumer's database. */
  notificationId?: string;
  /** Destination address (phone/email). Travels in the `notification` context, not as a tag. */
  sendTo?: string;
  /** Patient display name. Travels in the `notification` context. */
  patientName?: string;
  /** Full notification payload, attached as a Sentry context for debugging. */
  payload?: Record<string, any>;
}

/**
 * Minimal structural view of a Sentry scope.
 *
 * Lets `applyReportScope`/`applyPipelineScope` be tested with a plain fake —
 * no SDK mocking required.
 */
export interface ScopeLikeI {
  setTag(key: string, value: string): unknown;
  setContext(key: string, value: Record<string, any>): unknown;
  setUser(user: { id: string }): unknown;
  setExtra(key: string, value: unknown): unknown;
}
