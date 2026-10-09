#!/usr/bin/env tsx
/**
 * WhatsApp approval group routing. Run: npm run test:wa-approval-routing
 */
import assert from "node:assert/strict";
import { parseGroupJidMap, resolveApprovalGroupJid } from "../src/lib/wa-approval-routing";

const LS = "111@g.us";
const ZM = "222@g.us";
const BJ = "333@g.us";
const legacyOnly: Record<string, string | undefined> = { WA_BRIDGE_GROUP_JID: LS };

// Legacy env: Lesotho only
const ls = resolveApprovalGroupJid({ organizationId: "1pwr_lesotho", country: "LS", env: legacyOnly });
assert.equal(ls.jid, LS);
assert.equal(ls.source, "legacy:LS");

const zmLegacy = resolveApprovalGroupJid({ organizationId: "1pwr_zambia", country: "ZM", env: legacyOnly });
assert.equal(zmLegacy.jid, null);
assert.match(zmLegacy.reason ?? "", /no WhatsApp approval group configured for org 1pwr_zambia \(country ZM\) — suppressed/);

const bjLegacy = resolveApprovalGroupJid({ organizationId: "1pwr_benin", country: "BJ", env: legacyOnly });
assert.equal(bjLegacy.jid, null);

const unknownCountry = resolveApprovalGroupJid({ organizationId: "other", country: null, env: legacyOnly });
assert.equal(unknownCountry.jid, null);

// Org-keyed map
const zm = resolveApprovalGroupJid({
  organizationId: "1pwr_zambia",
  country: "ZM",
  env: { ...legacyOnly, WA_BRIDGE_GROUP_JID_BY_ORG: `1pwr_zambia=${ZM}` },
});
assert.equal(zm.jid, ZM);
assert.equal(zm.source, "map:1pwr_zambia");

// Country-keyed map
const bj = resolveApprovalGroupJid({
  organizationId: "1pwr_benin",
  country: "BJ",
  env: { ...legacyOnly, WA_BRIDGE_GROUP_JID_BY_ORG: `bj=${BJ}; 1pwr_zambia=${ZM}` },
});
assert.equal(bj.jid, BJ);
assert.equal(bj.source, "map:BJ");

// Map entry for Lesotho overrides legacy
const lsOverride = resolveApprovalGroupJid({
  organizationId: "1pwr_lesotho",
  country: "LS",
  env: { ...legacyOnly, WA_BRIDGE_GROUP_JID_BY_ORG: `1pwr_lesotho=999@g.us` },
});
assert.equal(lsOverride.jid, "999@g.us");

// Non-LS never falls back to legacy even when the map has other entries
const zmNoEntry = resolveApprovalGroupJid({
  organizationId: "1pwr_zambia",
  country: "ZM",
  env: { ...legacyOnly, WA_BRIDGE_GROUP_JID_BY_ORG: `BJ=${BJ}` },
});
assert.equal(zmNoEntry.jid, null);

// JSON form
assert.deepEqual(parseGroupJidMap(JSON.stringify({ "1PWR_Lesotho": LS, zm: ZM, BJ: BJ })), {
  "1pwr_lesotho": LS,
  ZM,
  BJ,
});

// Malformed entries ignored
assert.deepEqual(
  parseGroupJidMap(` 1pwr_zambia = ${ZM} ,,junk, =x@g.us, bad=notajid, ls=, ZM2=${BJ}x, p=123@s.whatsapp.net `),
  { "1pwr_zambia": ZM, p: "123@s.whatsapp.net" },
);
assert.deepEqual(parseGroupJidMap("{not json"), {});
assert.deepEqual(parseGroupJidMap('["a@g.us"]'), {});
assert.deepEqual(parseGroupJidMap('{"ZM":42,"BJ":"nope"}'), {});
assert.deepEqual(parseGroupJidMap(undefined), {});
assert.deepEqual(parseGroupJidMap(""), {});

console.log("OK");
