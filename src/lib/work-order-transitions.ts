/**
 * Valid work order status transitions (API + Work Orders UI must stay aligned).
 */
export const WORK_ORDER_VALID_TRANSITIONS: Record<string, string[]> = {
  submitted: ["queued", "rejected", "cancelled"],
  queued: ["in-progress", "cancelled"],
  "in-progress": ["needs-parts", "pr-submitted", "awaiting-parts", "completed", "cancelled"],
  "needs-parts": ["pr-submitted", "in-progress", "awaiting-parts", "cancelled"],
  "pr-submitted": ["in-progress", "awaiting-parts", "completed", "cancelled"],
  "awaiting-parts": ["in-progress", "needs-parts", "pr-submitted", "cancelled"],
  completed: ["closed", "return-repair", "rejected"],
  closed: ["return-repair"],
  "return-repair": ["queued", "in-progress"],
  cancelled: [],
  rejected: ["submitted"],
};
