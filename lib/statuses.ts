export const SUBSCRIPTION_STATUS = {
  PENDING: "pending",
  ACTIVE: "active",
  NEEDS_MANUAL_REVIEW: "needs_manual_review",
  EXPIRED: "expired",
  CANCELLED: "cancelled"
} as const;

export const OPERATIONAL_STATUS = {
  UNKNOWN: "unknown",
  PENDING_VALIDATION: "pending_validation",
  PAYMENT_VALIDATED: "payment_validated",
  INVITE_NOT_SENT: "invite_not_sent",
  INVITE_SENT_PENDING_JOIN: "invite_sent_pending_join",
  INVITE_DELIVERY_FAILED: "invite_delivery_failed",
  RETRY_PENDING: "retry_pending",
  BOT_BLOCKED: "bot_blocked",
  ACTIVE_IN_GROUP: "active_in_group",
  ACTIVE_OUT_OF_GROUP: "active_out_of_group",
  EXPIRED_MANUAL_REVIEW: "expired_manual_review",
  EXPULSION_PENDING: "expulsion_pending",
  EXPULSION_FAILED: "expulsion_failed",
  UNBAN_FAILED: "unban_failed",
  EXPELLED: "expelled",
  RESOLVED_MANUAL: "resolved_manual"
} as const;

export const EXPULSION_STATUS = {
  NOT_REQUIRED: "not_required",
  PENDING: "pending",
  FAILED: "failed",
  UNBAN_FAILED: "unban_failed",
  SUCCEEDED: "succeeded",
  RESOLVED_MANUAL: "resolved_manual"
} as const;

export const INCIDENT_STATUS = {
  OPEN: "open",
  INVESTIGATING: "investigating",
  ACKNOWLEDGED: "acknowledged",
  RESOLVED: "resolved",
  IGNORED: "ignored"
} as const;

export const INCIDENT_SEVERITY = {
  INFO: "info",
  LOW: "low",
  MEDIUM: "medium",
  WARNING: "warning",
  HIGH: "high",
  ERROR: "error",
  CRITICAL: "critical"
} as const;

export const MANUAL_PAYMENT_STATUS = {
  RECORDED: "recorded",
  APPLIED: "applied",
  CANCELLED: "cancelled"
} as const;

export type SubscriptionStatus = typeof SUBSCRIPTION_STATUS[keyof typeof SUBSCRIPTION_STATUS];
export type OperationalStatus = typeof OPERATIONAL_STATUS[keyof typeof OPERATIONAL_STATUS];
export type ExpulsionStatus = typeof EXPULSION_STATUS[keyof typeof EXPULSION_STATUS];
export type IncidentStatus = typeof INCIDENT_STATUS[keyof typeof INCIDENT_STATUS];
export type IncidentSeverity = typeof INCIDENT_SEVERITY[keyof typeof INCIDENT_SEVERITY];
export type ManualPaymentStatus = typeof MANUAL_PAYMENT_STATUS[keyof typeof MANUAL_PAYMENT_STATUS];
