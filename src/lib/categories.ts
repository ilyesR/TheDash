/**
 * Shared between the transaction form and the screenshot extractor, so the
 * model can only ever return a category the form can actually select.
 */
export const DEFAULT_EXPENSE_CATEGORIES = [
  "Housing",
  "Food",
  "Transport",
  "Petrol",
  "Subscriptions",
  "Entertainment",
  "Health",
  "Smoking",
  "Other",
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  "Salary",
  "Freelance",
  "Sales",
  "Investments",
  "Other",
] as const;

/** Kept for code paths that still need a synchronous fallback list. */
export const EXPENSE_CATEGORIES = DEFAULT_EXPENSE_CATEGORIES;
export const INCOME_CATEGORIES = DEFAULT_INCOME_CATEGORIES;

/**
 * Categories pre-marked as non-permissible when the list is first seeded.
 * Everything else is left to the user to decide in the app.
 */
export const DEFAULT_HARAM: readonly string[] = ["Smoking"];
