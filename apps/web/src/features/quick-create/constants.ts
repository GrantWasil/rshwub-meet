import { isSelfHosted } from "@/lib/constants";

// This community fork supports account-free creation on its own instance.
export const isQuickCreateEnabled =
  isSelfHosted || process.env.QUICK_CREATE_ENABLED === "true";
