/**
 * 1PWR EHS D018 "Approved Operator List" categories.
 *
 * Kept as a hardcoded enum because the set is SOP-audited; adding a category is a
 * deliberate pull request (the document is "D018" with a version stamp).
 *
 * Each row describes what proof is required before an authorization can be granted
 * (licence on file, training record on file, off-road written test passed, etc.)
 * and how to display it in the UI.
 */

export type OperatorCategoryGroup = "driving" | "plant" | "machining";

export type OperatorCategoryCode =
  | "fleet_vehicle_onroad"
  | "fleet_vehicle_onroad_heavy"
  | "motorcycle_onroad"
  | "ldf_defensive"
  | "offroad_vehicle"
  | "telehandler"
  | "excavator"
  | "drill_rig"
  | "tractor"
  | "crane"
  | "cnc_milling"
  | "manual_milling"
  | "cnc_plasma_cutting"
  | "mig_welder"
  | "tig_welder"
  | "machine_shop_general";

export interface OperatorCategoryMeta {
  code: OperatorCategoryCode;
  group: OperatorCategoryGroup;
  /** i18n key under ehsOperator.categories[code].label */
  labelKey: string;
  /** i18n key under ehsOperator.categories[code].description */
  descriptionKey: string;
  /** Licence scan on file must exist on the operator. */
  licenceRequired: boolean;
  /** Licence "valid-from" must show at least two years of continuity. */
  licenceTwoYearContinuity: boolean;
  /** A training-record upload on the authorization row is required. */
  trainingRecordRequired: boolean;
  /** The Driver Offroad Written test must be "pass". */
  writtenRequired: boolean;
  /** Whether the physical assessment (vision + hearing + reaction) applies. */
  physicalAssessmentRequired: boolean;
  /** Whether the practical proficiency test applies. */
  practicalRequired: boolean;
}

export const OPERATOR_CATEGORIES: OperatorCategoryMeta[] = [
  {
    code: "fleet_vehicle_onroad",
    group: "driving",
    labelKey: "fleet_vehicle_onroad.label",
    descriptionKey: "fleet_vehicle_onroad.description",
    licenceRequired: true,
    licenceTwoYearContinuity: true,
    trainingRecordRequired: false,
    writtenRequired: false,
    physicalAssessmentRequired: true,
    practicalRequired: true,
  },
  {
    code: "fleet_vehicle_onroad_heavy",
    group: "driving",
    labelKey: "fleet_vehicle_onroad_heavy.label",
    descriptionKey: "fleet_vehicle_onroad_heavy.description",
    licenceRequired: true,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: false,
    physicalAssessmentRequired: true,
    practicalRequired: true,
  },
  {
    code: "motorcycle_onroad",
    group: "driving",
    labelKey: "motorcycle_onroad.label",
    descriptionKey: "motorcycle_onroad.description",
    licenceRequired: true,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: false,
    writtenRequired: false,
    physicalAssessmentRequired: true,
    practicalRequired: true,
  },
  {
    code: "ldf_defensive",
    group: "driving",
    labelKey: "ldf_defensive.label",
    descriptionKey: "ldf_defensive.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: false,
    physicalAssessmentRequired: false,
    practicalRequired: false,
  },
  {
    code: "offroad_vehicle",
    group: "plant",
    labelKey: "offroad_vehicle.label",
    descriptionKey: "offroad_vehicle.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: true,
    physicalAssessmentRequired: true,
    practicalRequired: true,
  },
  {
    code: "telehandler",
    group: "plant",
    labelKey: "telehandler.label",
    descriptionKey: "telehandler.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: true,
    physicalAssessmentRequired: true,
    practicalRequired: true,
  },
  {
    code: "excavator",
    group: "plant",
    labelKey: "excavator.label",
    descriptionKey: "excavator.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: true,
    physicalAssessmentRequired: true,
    practicalRequired: true,
  },
  {
    code: "drill_rig",
    group: "plant",
    labelKey: "drill_rig.label",
    descriptionKey: "drill_rig.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: true,
    physicalAssessmentRequired: true,
    practicalRequired: true,
  },
  {
    code: "tractor",
    group: "plant",
    labelKey: "tractor.label",
    descriptionKey: "tractor.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: false,
    physicalAssessmentRequired: true,
    practicalRequired: true,
  },
  {
    code: "crane",
    group: "plant",
    labelKey: "crane.label",
    descriptionKey: "crane.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: true,
    physicalAssessmentRequired: true,
    practicalRequired: true,
  },
  {
    code: "cnc_milling",
    group: "machining",
    labelKey: "cnc_milling.label",
    descriptionKey: "cnc_milling.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: false,
    physicalAssessmentRequired: false,
    practicalRequired: false,
  },
  {
    code: "manual_milling",
    group: "machining",
    labelKey: "manual_milling.label",
    descriptionKey: "manual_milling.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: false,
    physicalAssessmentRequired: false,
    practicalRequired: false,
  },
  {
    code: "cnc_plasma_cutting",
    group: "machining",
    labelKey: "cnc_plasma_cutting.label",
    descriptionKey: "cnc_plasma_cutting.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: false,
    physicalAssessmentRequired: false,
    practicalRequired: false,
  },
  {
    code: "mig_welder",
    group: "machining",
    labelKey: "mig_welder.label",
    descriptionKey: "mig_welder.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: false,
    physicalAssessmentRequired: false,
    practicalRequired: false,
  },
  {
    code: "tig_welder",
    group: "machining",
    labelKey: "tig_welder.label",
    descriptionKey: "tig_welder.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: false,
    physicalAssessmentRequired: false,
    practicalRequired: false,
  },
  {
    code: "machine_shop_general",
    group: "machining",
    labelKey: "machine_shop_general.label",
    descriptionKey: "machine_shop_general.description",
    licenceRequired: false,
    licenceTwoYearContinuity: false,
    trainingRecordRequired: true,
    writtenRequired: false,
    physicalAssessmentRequired: false,
    practicalRequired: false,
  },
];

const INDEX_BY_CODE: Map<string, OperatorCategoryMeta> = new Map(
  OPERATOR_CATEGORIES.map((c) => [c.code, c])
);

export function getOperatorCategory(code: string): OperatorCategoryMeta | undefined {
  return INDEX_BY_CODE.get(code);
}

export function isKnownOperatorCategory(code: string): code is OperatorCategoryCode {
  return INDEX_BY_CODE.has(code);
}

export const OPERATOR_CATEGORY_CODES: readonly OperatorCategoryCode[] = OPERATOR_CATEGORIES.map(
  (c) => c.code
);

/**
 * Default category for fleet vehicles when the caller doesn't know what class is involved.
 * Matches the historical "approved driver" concept in Fleet Hub.
 */
export const DEFAULT_OPERATOR_CATEGORY: OperatorCategoryCode = "fleet_vehicle_onroad";

/**
 * Map a Fleet Hub vehicles.asset_class to the operator category that a driver must hold
 * before they can appear in the driver combobox or submit a vehicle request for that
 * vehicle. Returns null when Fleet Hub shouldn't gate at all (e.g. yellow plant has
 * many sub-types; the caller falls back to the generic on-road check).
 */
export function assetClassToOperatorCategory(assetClass: string | null | undefined): OperatorCategoryCode | null {
  switch ((assetClass || "").toLowerCase()) {
    case "4wd":
    case "trailer":
    case "mobile-equipment":
      return "fleet_vehicle_onroad";
    case "cargo-truck":
      return "fleet_vehicle_onroad_heavy";
    case "tractor":
      return "tractor";
    case "yellow-plant":
      // Yellow plant covers excavator / telehandler / drill rig / crane — ambiguous here,
      // the UI chooses how to gate further when the specific piece is known.
      return null;
    default:
      return "fleet_vehicle_onroad";
  }
}

export type OperatorGrant = "none" | "approved" | "trainer";

export function isOperatorGrant(value: string): value is OperatorGrant {
  return value === "none" || value === "approved" || value === "trainer";
}

export type AssessmentResult = "pass" | "fail" | "pending";

export function isAssessmentResult(value: string): value is AssessmentResult {
  return value === "pass" || value === "fail" || value === "pending";
}

export const CATEGORY_GROUP_ORDER: OperatorCategoryGroup[] = ["driving", "plant", "machining"];

export function categoriesInGroup(group: OperatorCategoryGroup): OperatorCategoryMeta[] {
  return OPERATOR_CATEGORIES.filter((c) => c.group === group);
}
