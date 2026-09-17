import { createServerFn } from "@tanstack/react-start";
import { TELEBIRR_PHONE, CBE_ACCOUNT, ACCOUNT_NAME } from "@/lib/payment-config";

// Deposit destinations come from the shared payment-config module so the
// number/account can never drift between the UI and server validation.
export const getDepositInstructions = createServerFn({ method: "GET" }).handler(async () => ({
  telebirr: {
    phone: TELEBIRR_PHONE,
    name: ACCOUNT_NAME,
  },
  cbe: {
    account_number: CBE_ACCOUNT,
    account_name: ACCOUNT_NAME,
  },
}));
