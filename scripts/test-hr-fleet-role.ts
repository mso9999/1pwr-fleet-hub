#!/usr/bin/env tsx
/**
 * HR job title → Fleet users.role. Run: npx tsx scripts/test-hr-fleet-role.ts
 */
import assert from "node:assert/strict";
import { fleetRoleFromHrPosition, planHrFleetRoleUpdates } from "../src/lib/hr-fleet-role";

assert.equal(fleetRoleFromHrPosition("Fleet Lead", "Fleet"), "fleet_lead");
assert.equal(fleetRoleFromHrPosition("Deputy Fleet Lead", "Fleet"), "fleet_lead");
assert.equal(fleetRoleFromHrPosition("Senior Mechanic", "Fleet"), "mechanic");
assert.equal(fleetRoleFromHrPosition("Driver and Mechanic", "Fleet"), "mechanic");
assert.equal(fleetRoleFromHrPosition("Driver", "Fleet"), "driver");
assert.equal(fleetRoleFromHrPosition("Country Manager", "Admin"), null);
assert.equal(fleetRoleFromHrPosition("Procurement Officer", "Procurement"), null);
assert.equal(fleetRoleFromHrPosition("Mechanic", "Reticulation"), null);
assert.equal(fleetRoleFromHrPosition("", "Fleet"), null);

const changes = planHrFleetRoleUpdates(
  [
    { email: "Kelebone@1pwrafrica.com", role: "REQ" },
    { email: "kelebone@1pwrafrica.com", role: "fleet_lead" },
    { email: "seutloali@1pwrafrica.com", role: "USER" },
    { email: "tebesi@1pwrafrica.com", role: "USER" },
    { email: "thene@1pwrafrica.com", role: "REQ" },
    { email: "mso@1pwrafrica.com", role: "superadmin" },
    { email: "amy@1pwrafrica.com", role: "admin" },
    { email: "eduardo@1pwrafrica.com", role: "manager" },
    { email: "molefe@1pwrafrica.com", role: "USER" },
  ],
  [
    { email: "kelebone@1pwrafrica.com", title: "Fleet Lead", department: "Fleet" },
    { email: "seutloali@1pwrafrica.com", title: "Mechanic", department: "Fleet" },
    { email: "tebesi@1pwrafrica.com", title: "Senior Mechanic", department: "Fleet" },
    { email: "thene@1pwrafrica.com", title: "Driver and Mechanic", department: "Fleet" },
    { email: "mso@1pwrafrica.com", title: "Fleet Lead", department: "Fleet" },
    { email: "amy@1pwrafrica.com", title: null, department: null },
    { email: "eduardo@1pwrafrica.com", title: "Country Manager", department: "Admin" },
  ],
);

assert.deepEqual(
  changes.map((change) => `${change.email} ${change.from}→${change.to}`),
  [
    "kelebone@1pwrafrica.com REQ→fleet_lead",
    "seutloali@1pwrafrica.com USER→mechanic",
    "tebesi@1pwrafrica.com USER→mechanic",
    "thene@1pwrafrica.com REQ→mechanic",
  ],
);

console.log("hr fleet role tests passed");
