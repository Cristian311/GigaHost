/** Badge variant per order / invoice / subscription status. */
export const BILLING_STATUS_VARIANT: Record<
  string,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ACTIVE: "default",
  PAID: "default",
  PENDING: "secondary",
  OPEN: "secondary",
  DRAFT: "secondary",
  PAST_DUE: "destructive",
  FAILED: "destructive",
  CANCELLED: "outline",
  EXPIRED: "outline",
  VOID: "outline",
};
