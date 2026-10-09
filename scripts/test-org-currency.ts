/** Test: new vehicles default purchase_currency to the org's currency, not always LSL. */
import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { defaultCurrencyForOrg, FALLBACK_CURRENCY } from "../src/lib/org-currency";

const db = new Database(":memory:");
db.exec(`CREATE TABLE organizations (id TEXT PRIMARY KEY, currency TEXT);
  INSERT INTO organizations VALUES ('1pwr_lesotho','LSL'),('1pwr_zambia','ZMW'),('1pwr_benin','XOF'),('blank_org','');`);

assert.equal(defaultCurrencyForOrg(db, "1pwr_lesotho"), "LSL");
assert.equal(defaultCurrencyForOrg(db, "1pwr_zambia"), "ZMW");
assert.equal(defaultCurrencyForOrg(db, " 1PWR_ZAMBIA "), "ZMW");
assert.equal(defaultCurrencyForOrg(db, "1pwr_benin"), "XOF");
assert.equal(defaultCurrencyForOrg(db, "blank_org"), FALLBACK_CURRENCY);
assert.equal(defaultCurrencyForOrg(db, "unknown_org"), FALLBACK_CURRENCY);
assert.equal(defaultCurrencyForOrg(new Database(":memory:"), "1pwr_zambia"), FALLBACK_CURRENCY); // no table
console.log("org currency tests passed");
