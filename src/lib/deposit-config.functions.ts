import { createServerFn } from "@tanstack/react-start";

// Deposit destinations — hardcoded so users always see the correct number/account.
const TELEBIRR_PHONE = "0907633801";
const CBE_ACCOUNT = "1000604178669";
const ACCOUNT_NAME = "Tegene";

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
