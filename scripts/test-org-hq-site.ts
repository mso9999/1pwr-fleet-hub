/** Test: new vehicles default to the org's active HQ site (LSK for Zambia), not an inactive `HQ`. */
import Database from "better-sqlite3";
import assert from "node:assert/strict";
import { orgHqSiteCode, resolveVehicleSite } from "../src/lib/org-hq-site";

const db = new Database(":memory:");
db.exec(`
  CREATE TABLE organizations (id TEXT PRIMARY KEY, route_origin_lat REAL, route_origin_lng REAL);
  CREATE TABLE reference_data (id TEXT, organization_id TEXT, type TEXT, code TEXT, label TEXT, sort_order INTEGER, active INTEGER, meta TEXT);
  INSERT INTO organizations VALUES ('1pwr_lesotho', -29.315, 27.487), ('1pwr_zambia', -15.4152423, 28.3511183), ('1pwr_benin', NULL, NULL), ('nohq', NULL, NULL);
  INSERT INTO reference_data VALUES
    ('1','1pwr_lesotho','site','HQ','Head Office',0,1,'{}'),
    ('2','1pwr_lesotho','site','MAK','Ha Makebe',1,1,'{}'),
    ('3','1pwr_zambia','site','HQ','Siège social',0,0,'{}'),
    ('4','1pwr_zambia','site','HQZ','1PWR ZM Headquarters',0,1,'{"latitude":null,"longitude":null}'),
    ('5','1pwr_zambia','site','LSK','LUN HQ (Lusaka)',0,1,'{"latitude":-15.4152423,"longitude":28.3511183}'),
    ('6','1pwr_zambia','site','PET','PET field office (Petauke)',0,1,'{"latitude":-14.256295,"longitude":31.329202}'),
    ('7','1pwr_benin','site','HQ','Siège social',0,1,'{}'),
    ('8','nohq','site','ABC','Somewhere',0,1,'{}');
`);

assert.equal(orgHqSiteCode(db, "1pwr_lesotho"), "HQ");
assert.equal(orgHqSiteCode(db, "1pwr_zambia"), "LSK");
assert.equal(orgHqSiteCode(db, "1pwr_benin"), "HQ");
assert.equal(orgHqSiteCode(db, "nohq"), "HQ");
assert.equal(orgHqSiteCode(db, "unknown"), "HQ");

assert.equal(resolveVehicleSite(db, "1pwr_zambia", ""), "LSK");
assert.equal(resolveVehicleSite(db, "1pwr_zambia", undefined), "LSK");
assert.equal(resolveVehicleSite(db, "1pwr_zambia", "HQ"), "LSK");
assert.equal(resolveVehicleSite(db, "1pwr_zambia", "PET"), "PET");
assert.equal(resolveVehicleSite(db, "1pwr_lesotho", "HQ"), "HQ");
assert.equal(resolveVehicleSite(db, "1pwr_lesotho", ""), "HQ");
assert.equal(resolveVehicleSite(db, "1pwr_lesotho", "MAK"), "MAK");

// Without the HQZ/route-origin match, the labelled HQ site wins.
db.exec("UPDATE organizations SET route_origin_lat = NULL WHERE id = '1pwr_zambia'");
assert.equal(orgHqSiteCode(db, "1pwr_zambia"), "HQZ");
console.log("org HQ site tests passed");
