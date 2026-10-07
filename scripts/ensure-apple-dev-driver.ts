import { getDb } from "../lib/db";
import {
  APPLE_DEV_DRIVER_EMAIL,
  APPLE_DEV_DRIVER_NAME,
  APPLE_DEV_DRIVER_PASSWORD,
  ensureAppleDevDriverLogin,
} from "../lib/driver-login-fixture";

ensureAppleDevDriverLogin(getDb(), { force: true });
console.log(`Ensured ${APPLE_DEV_DRIVER_NAME} <${APPLE_DEV_DRIVER_EMAIL}> (password ${APPLE_DEV_DRIVER_PASSWORD}).`);
