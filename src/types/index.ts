import type { BodyMark } from "@/lib/inspection-body-diagram";

// ── Organizations ──
export interface Organization {
  id: string;
  name: string;
  code: string;
  country: string;
  currency: string;
  timezoneOffset: number;
  active: boolean;
}

// ── Reference Data (admin-managed dropdowns) ──
export const REFERENCE_DATA_TYPES = {
  SITE: "site",
  MISSION_TYPE: "mission_type",
  THIRD_PARTY_SHOP: "third_party_shop",
} as const;

export type ReferenceDataType = (typeof REFERENCE_DATA_TYPES)[keyof typeof REFERENCE_DATA_TYPES];

export interface ReferenceDataItem {
  id: string;
  organizationId: string;
  type: ReferenceDataType;
  code: string;
  label: string;
  sortOrder: number;
  active: boolean;
  meta: string;
}

// ── Vehicle ──
export const VEHICLE_STATUS = {
  OPERATIONAL: "operational",
  DEPLOYED: "deployed",
  /**
   * Pre-WO investigation state. Fleet has flagged the vehicle for inspection but
   * hasn't decided yet whether it goes into the workshop, needs parts, or stays in service.
   * Free to set; no open work order required.
   */
  DIAGNOSIS: "diagnosis",
  MAINTENANCE_HQ: "maintenance-hq",
  MAINTENANCE_3RD: "maintenance-3rdparty",
  AWAITING_PARTS: "awaiting-parts",
  GROUNDED: "grounded",
  WRITTEN_OFF: "written-off",
} as const;

export type VehicleStatus = (typeof VEHICLE_STATUS)[keyof typeof VEHICLE_STATUS];

/**
 * Vehicle statuses that require at least one open work order (status in
 * submitted | queued | in-progress | needs-parts | pr-submitted | awaiting-parts) to set or remain in.
 */
export const VEHICLE_STATUSES_REQUIRING_OPEN_WO: VehicleStatus[] = [
  VEHICLE_STATUS.MAINTENANCE_HQ,
  VEHICLE_STATUS.MAINTENANCE_3RD,
  VEHICLE_STATUS.AWAITING_PARTS,
  VEHICLE_STATUS.GROUNDED,
];

/**
 * Vehicle statuses that require management sign-off (admin / manager / superadmin / executive).
 */
export const VEHICLE_STATUSES_REQUIRING_SIGNOFF: VehicleStatus[] = [
  VEHICLE_STATUS.WRITTEN_OFF,
];

/** Fleet vehicle / equipment category (stored in vehicles.asset_class). */
export const ASSET_CLASS = {
  FOUR_WD: "4wd",
  CARGO_TRUCK: "cargo-truck",
  YELLOW_PLANT: "yellow-plant",
  TRACTOR: "tractor",
  TRAILER: "trailer",
  MOBILE_EQUIPMENT: "mobile-equipment",
} as const;

export type AssetClass = (typeof ASSET_CLASS)[keyof typeof ASSET_CLASS];

/** Human-readable labels for UI and exports. */
export const ASSET_CLASS_LABELS: Record<AssetClass, string> = {
  "4wd": "4WD SUV & double-cab bakkie",
  "cargo-truck": "Cargo truck",
  "yellow-plant": "Yellow plant",
  tractor: "Tractors",
  trailer: "Trailers",
  "mobile-equipment": "Mobile equipment (compressors)",
};

/** Display string for asset_class (handles legacy DB values before migration). */
export function assetClassLabel(code: string): string {
  if ((Object.values(ASSET_CLASS) as string[]).includes(code)) {
    return ASSET_CLASS_LABELS[code as AssetClass];
  }
  const legacy: Record<string, string> = {
    "light-vehicle": ASSET_CLASS_LABELS["4wd"],
    "heavy-vehicle": ASSET_CLASS_LABELS["cargo-truck"],
    equipment: ASSET_CLASS_LABELS["mobile-equipment"],
  };
  return legacy[code] || code.replace(/-/g, " ");
}

export const TRACKER_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  NO_SIGNAL: "no-signal",
  NOT_INSTALLED: "not-installed",
  UNKNOWN: "unknown",
} as const;

export type TrackerStatus = (typeof TRACKER_STATUS)[keyof typeof TRACKER_STATUS];

export const FUEL_TYPE = {
  DIESEL: "diesel",
  PETROL: "petrol",
  ELECTRIC: "electric",
} as const;

export type FuelType = (typeof FUEL_TYPE)[keyof typeof FUEL_TYPE];

export const TRANSMISSION_TYPE = {
  MANUAL: "manual",
  AUTOMATIC: "automatic",
} as const;

export type TransmissionType = (typeof TRANSMISSION_TYPE)[keyof typeof TRANSMISSION_TYPE];

export const DRIVETRAIN = {
  TWO_WD: "2wd",
  FOUR_WD: "4wd",
  AWD: "awd",
} as const;

export type Drivetrain = (typeof DRIVETRAIN)[keyof typeof DRIVETRAIN];

export const EOL_STATUS = {
  ACTIVE: "active",
  MONITOR: "monitor",
  END_OF_LIFE: "end-of-life",
} as const;

export type EolStatus = (typeof EOL_STATUS)[keyof typeof EOL_STATUS];

export const VEHICLE_POOL = {
  GENERAL: "general",
  EXECUTIVE: "executive",
  FIELD: "field",
  HEAVY: "heavy",
} as const;

export type VehiclePool = (typeof VEHICLE_POOL)[keyof typeof VEHICLE_POOL];

export interface Vehicle {
  id: string;
  organizationId: string;
  code: string;
  make: string;
  model: string;
  year: number | null;
  licensePlate: string;
  vin: string;
  engineNumber: string;
  assetClass: AssetClass;
  homeLocation: string;
  currentLocation: string;
  status: VehicleStatus;
  photoUrl: string;
  dateInService: string;
  notes: string;
  // Tracker
  trackerImei: string;
  trackerProvider: string;
  trackerSim: string;
  trackerModel: string;
  trackerInstallDate: string;
  trackerStatus: TrackerStatus;
  // Financial / TCO
  purchasePrice: number;
  purchaseDate: string;
  purchaseCurrency: string;
  residualValue: number;
  insuranceMonthly: number;
  // Classification
  fuelType: string;
  transmission: string;
  drivetrain: string;
  engineCapacityCc: number;
  seatingCapacity: number;
  payloadCapacityKg: number;
  // Lifecycle
  totalMileageKm: number;
  expectedServiceLifeKm: number;
  expectedServiceLifeYears: number;
  eolScore: number;
  eolStatus: string;
  // Maintenance intervals
  serviceIntervalKm: number;
  serviceIntervalMonths: number;
  lastServiceDate: string;
  lastServiceKm: number;
  nextServiceDueDate: string;
  nextServiceDueKm: number;
  // Pool
  pool: string;
  assignedTeam: string;
  /** Registration disc expiry (YYYY-MM-DD); empty if not tracked. */
  registrationDiscExpiryDate?: string;
  // Timestamps
  createdAt: string;
  updatedAt: string;
  /** Set server-side when request includes Firebase Bearer token */
  createdById?: string;
  createdByName?: string;
  updatedById?: string;
  updatedByName?: string;
}

// ── Trips ──
export const MISSION_PRIORITY = {
  LOW: "low",
  NORMAL: "normal",
  HIGH: "high",
} as const;

export type MissionPriority = (typeof MISSION_PRIORITY)[keyof typeof MISSION_PRIORITY];

export const TRIP_APPROVAL_STATUS = {
  AUTO_APPROVED: "auto-approved",
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
} as const;

export type TripApprovalStatus = (typeof TRIP_APPROVAL_STATUS)[keyof typeof TRIP_APPROVAL_STATUS];
export type TripShape = "one_way" | "round_trip" | "multi_stop";

export interface MissionStop {
  id: string;
  missionId: string;
  stopOrder: number;
  location: string;
  loadOut: string;
  loadIn: string;
  notes: string;
}

export interface Trip {
  id: string;
  organizationId: string;
  vehicleId: string;
  vehicleCode?: string;
  driverId: string;
  driverName: string;
  odoStart: number;
  odoEnd: number | null;
  departureLocation: string;
  destination: string;
  arrivalLocation: string;
  missionType: string;
  tripShape?: TripShape;
  /** local = short in-town; field = multi-day / substantive deployment (stricter gates). */
  missionProfile?: string;
  passengers: string;
  loadOut: string;
  loadIn: string;
  checkoutAt: string;
  checkinAt: string | null;
  issuesObserved: string;
  distance: number | null;
  source: string;
  stops?: TripStop[];
  // Mission profiling extensions
  authorizedDriverVerified: boolean;
  approvedDrivers: string;
  loadoutManifest: string;
  expectedReturnAt: string | null;
  missionPriority: string;
  approvalStatus: string;
  approvedBy: string;
  amAllocationIds: string;
}

export interface TripStop {
  id: string;
  tripId: string;
  stopNumber: number;
  location: string;
  arrivedAt: string | null;
  departedAt: string | null;
  odoReading: number | null;
  loadOut: string;
  loadIn: string;
  notes: string;
}

// ── Inspections ──
export const INSPECTION_RATING = {
  PASS: "pass",
  CAUTION: "caution",
  FAIL: "fail",
} as const;

export type InspectionRating = (typeof INSPECTION_RATING)[keyof typeof INSPECTION_RATING];

export interface InspectionItem {
  category: string;
  item: string;
  rating: InspectionRating;
  note: string;
  bodyMarks?: BodyMark[];
}

export interface Inspection {
  id: string;
  organizationId: string;
  vehicleId: string;
  inspectorId: string;
  inspectorName: string;
  type: "pre-departure" | "detailed";
  items: InspectionItem[];
  overallPass: boolean;
  source: string;
  sourceImageUrl: string;
  createdAt: string;
}

// ── Work Orders ──
export const WORK_ORDER_STATUS = {
  SUBMITTED: "submitted",
  QUEUED: "queued",
  IN_PROGRESS: "in-progress",
  /** Parts identified; procurement / PR not yet submitted. */
  NEEDS_PARTS: "needs-parts",
  /** PR submitted and linked; waiting on approval, PO, or delivery. */
  PR_SUBMITTED: "pr-submitted",
  AWAITING_PARTS: "awaiting-parts",
  COMPLETED: "completed",
  CLOSED: "closed",
  RETURN_REPAIR: "return-repair",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
} as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUS)[keyof typeof WORK_ORDER_STATUS];

/** Open work orders that satisfy the vehicle-status "open WO" gate (excludes return-repair). */
export const OPEN_WORK_ORDER_STATUSES_FOR_VEHICLE_RULE: readonly string[] = [
  WORK_ORDER_STATUS.SUBMITTED,
  WORK_ORDER_STATUS.QUEUED,
  WORK_ORDER_STATUS.IN_PROGRESS,
  WORK_ORDER_STATUS.NEEDS_PARTS,
  WORK_ORDER_STATUS.PR_SUBMITTED,
  WORK_ORDER_STATUS.AWAITING_PARTS,
];

export const WORK_ORDER_TYPE = {
  CORRECTIVE: "corrective",
  SCHEDULED: "scheduled",
  INSPECTION_FLAGGED: "inspection-flagged",
} as const;

export type WorkOrderType = (typeof WORK_ORDER_TYPE)[keyof typeof WORK_ORDER_TYPE];

export const WORK_ORDER_PRIORITY = {
  CRITICAL: "critical",
  HIGH: "high",
  MEDIUM: "medium",
  LOW: "low",
} as const;

export type WorkOrderPriority = (typeof WORK_ORDER_PRIORITY)[keyof typeof WORK_ORDER_PRIORITY];

export const REPAIR_LOCATION = {
  HQ: "hq",
  THIRD_PARTY: "3rd-party",
  FIELD: "field",
} as const;

export type RepairLocation = (typeof REPAIR_LOCATION)[keyof typeof REPAIR_LOCATION];

export interface WorkOrder {
  id: string;
  organizationId: string;
  vehicleId: string;
  vehicleCode: string;
  title: string;
  description: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  status: WorkOrderStatus;
  assignedTo: string;
  repairLocation: RepairLocation;
  thirdPartyShop: string;
  reportedBy: string;
  validatedBy: string;
  closingInspectionId: string | null;
  odoAtReport: number | null;
  totalLabourHours: number;
  partsCost: number;
  labourCost: number;
  thirdPartyCost: number;
  totalCost: number;
  remarks: string;
  downtimeStart: string;
  downtimeEnd: string | null;
  // 3rd-party tracking
  thirdPartyQuoteAmount: number;
  thirdPartyInvoiceNumber: string;
  thirdPartyInvoiceAmount: number;
  thirdPartyDeliveryDate: string;
  thirdPartyQualityNotes: string;
  createdAt: string;
  updatedAt: string;
  daysOpen?: number;
  statusHistory?: WorkOrderStatusEntry[];
  labor?: WorkOrderLabor[];
  poLinks?: WorkOrderPOLink[];
  parts?: Part[];
}

export interface WorkOrderStatusEntry {
  id: number;
  workOrderId: string;
  fromStatus: string | null;
  toStatus: string;
  changedById: string;
  changedByName: string;
  reason: string;
  changedAt: string;
}

export interface WorkOrderLabor {
  id: string;
  workOrderId: string;
  workerName: string;
  workerId: string;
  role: string;
  hours: number;
  ratePerHour: number;
  description: string;
  workDate: string;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface WorkOrderPOLink {
  id: string;
  workOrderId: string;
  prNumber: string;
  poNumber: string;
  vendor: string;
  description: string;
  amount: number;
  currency: string;
  status: string;
  prSystemUrl: string;
  createdAt: string;
}

// ── Parts ──
export const PART_STATUS = {
  NEEDED: "needed",
  PR_SUBMITTED: "pr-submitted",
  APPROVED: "approved",
  ORDERED: "ordered",
  RECEIVED: "received",
} as const;

export type PartStatus = (typeof PART_STATUS)[keyof typeof PART_STATUS];

export interface Part {
  id: string;
  workOrderId: string;
  description: string;
  quantity: number;
  unitCost: number | null;
  supplier: string;
  prStatus: PartStatus;
  deliveryEta: string;
}

// ── Users ──
export const USER_ROLE = {
  DRIVER: "driver",
  MECHANIC: "mechanic",
  FLEET_LEAD: "fleet_lead",
  MANAGER: "manager",
  ADMIN: "admin",
} as const;

export type UserRole = (typeof USER_ROLE)[keyof typeof USER_ROLE];

export interface User {
  id: string;
  firebaseUid: string | null;
  email: string;
  firstName: string;
  lastName: string;
  name: string;
  role: string;
  department: string;
  organizationId: string;
  permissionLevel: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Total Cost of Ownership ──
export interface VehicleTCO {
  vehicleId: string;
  vehicleCode: string;
  vehicleMake: string;
  vehicleModel: string;
  partsCost: number;
  labourCost: number;
  thirdPartyCost: number;
  totalCost: number;
  workOrderCount: number;
  totalDowntimeDays: number;
  avgRepairDays: number;
  costPerDay: number;
}

// ── Vehicle Tracking Reports ──
export interface VehicleTrackingReport {
  id: string;
  organizationId: string;
  vehicleId: string;
  vehicleCode?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  reportDate: string;
  periodStart: string;
  periodEnd: string;
  totalDistanceKm: number;
  totalTrips: number;
  totalDrivingHours: number;
  totalIdleHours: number;
  maxSpeedKmh: number;
  avgSpeedKmh: number;
  geofenceViolations: number;
  harshBrakingEvents: number;
  harshAccelerationEvents: number;
  afterHoursUsageMinutes: number;
  fuelConsumedLiters: number;
  startLocation: string;
  endLocation: string;
  reportSource: string;
  rawData: string;
  notes: string;
  generatedAt: string;
  createdAt: string;
}

// ── Media Attachments ──
export const MEDIA_CATEGORY = {
  GENERAL: "general",
  BEFORE_PHOTO: "before-photo",
  AFTER_PHOTO: "after-photo",
  DAMAGE: "damage",
  RECEIPT: "receipt",
  INSPECTION: "inspection",
  DOCUMENT: "document",
  INSURANCE: "insurance",
  MILEAGE_EVIDENCE: "mileage-evidence",
  /** Driver vehicle check — exterior angles */
  DVC_EXTERIOR_FRONT: "dvc-exterior-front",
  DVC_EXTERIOR_REAR: "dvc-exterior-rear",
  DVC_EXTERIOR_LEFT: "dvc-exterior-left",
  DVC_EXTERIOR_RIGHT: "dvc-exterior-right",
  /** Driver vehicle check — odometer matches typed km */
  DVC_ODOMETER: "dvc-odometer",
  /** Trip — daily / in-mission odometer log photo */
  TRIP_ODO: "trip-odo",
} as const;

export type MediaCategory = (typeof MEDIA_CATEGORY)[keyof typeof MEDIA_CATEGORY];

export interface MediaAttachment {
  id: string;
  entityType: string;
  entityId: string;
  fileName: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  caption: string;
  category: MediaCategory;
  uploadedById: string;
  uploadedByName: string;
  createdAt: string;
}

// ── Work Order Progress Updates ──
export interface WorkOrderUpdate {
  id: string;
  workOrderId: string;
  updateType: string;
  note: string;
  postedById: string;
  postedByName: string;
  hasPhotos: boolean;
  photoCount: number;
  createdAt: string;
}

// ── Field Issue Reports ──
export const ISSUE_SEVERITY = {
  LOW: "low",
  MEDIUM: "medium",
  HIGH: "high",
  CRITICAL: "critical",
} as const;

export type IssueSeverity = (typeof ISSUE_SEVERITY)[keyof typeof ISSUE_SEVERITY];

/** Field issue ticket lifecycle (ticketing-style). */
export const FIELD_ISSUE_STATUS = {
  OPEN: "open",
  CONVERTED: "converted",
  CLOSED: "closed",
  DISMISSED: "dismissed",
} as const;

export type FieldIssueStatus = (typeof FIELD_ISSUE_STATUS)[keyof typeof FIELD_ISSUE_STATUS];

/** Closeout / resolution outcome for a field issue ticket. */
export const FIELD_ISSUE_CLOSEOUT_OUTCOME = {
  RESOLVED_NO_WO: "resolved_no_wo",
  RESOLVED_VIA_WO: "resolved_via_work_order",
  DEFERRED: "deferred",
  DUPLICATE: "duplicate",
  NOT_REPRODUCIBLE: "not_reproducible",
  OTHER: "other",
} as const;

export type FieldIssueCloseoutOutcome =
  (typeof FIELD_ISSUE_CLOSEOUT_OUTCOME)[keyof typeof FIELD_ISSUE_CLOSEOUT_OUTCOME];

export interface FieldIssueReport {
  id: string;
  organizationId: string;
  vehicleId: string;
  vehicleCode?: string;
  vehicleMake?: string;
  vehicleModel?: string;
  /** Human-readable ticket UID, e.g. IR-LS-2026-00001 */
  ticketUid: string;
  reportedById: string;
  reportedByName: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  location: string;
  odometer: number | null;
  isDriveable: boolean;
  photoCount: number;
  status: string;
  workOrderId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  closedAt: string | null;
  closedById: string | null;
  closedByName: string | null;
  attendedByName: string | null;
  closeoutOutcome: string | null;
  closeoutNotes: string | null;
}

// ── Driver Vehicle Checks ──
export const CHECK_DIRECTION = {
  DEPARTING: "departing",
  RETURNING: "returning",
} as const;

export type CheckDirection = (typeof CHECK_DIRECTION)[keyof typeof CHECK_DIRECTION];

export interface DriverVehicleCheck {
  id: string;
  organizationId: string;
  vehicleId: string;
  vehicleCode?: string;
  tripId: string | null;
  driverId: string;
  driverName: string;
  mileageKm: number | null;
  checkDate: string;
  routeFrom: string;
  routeTo: string;
  direction: CheckDirection;
  // Status items stored as individual fields (pass | fail)
  electricsFrontLights: string;
  electricsRearLights: string;
  electricsIndicators: string;
  electricsBrakeLights: string;
  electricsHorn: string;
  electricsWindows: string;
  electricsCentralLocking: string;
  electricsWipers: string;
  electricsDashboardGauges: string;
  electricsAcHeating: string;
  fluidsEngineOil: string;
  fluidsEngineCoolant: string;
  fluidsPowerSteering: string;
  fluidsTransmission: string;
  fluidsFuel: string;
  driveSteering: string;
  driveBrakes: string;
  driveTirePressure: string;
  visualSpareWheelCondition: string;
  visualDoors: string;
  failureDescriptions: string;
  remarks: string;
  /** SIM / contact number for the 1PWR handset checked in with the vehicle */
  travelPhoneNumber: string;
  // Equipment (1 = yes, 0 = no)
  equipJack: number;
  equipSpareWheel: number;
  equipTriangle: number;
  equipJumpLeads: number;
  equipFireExtinguisher: number;
  equipPhoneCharger: number;
  equipFirstAidKit: number;
  equipFlashlight: number;
  equipToolWheelSpanners: number;
  equipToolMultimeter: number;
  equipToolCableCutters: number;
  equipToolPliers: number;
  equipToolTowStraps: number;
  equipToolInverter: number;
  // Exceptions
  hasExceptions: boolean;
  exceptionItems: string;
  exceptionApproved: boolean;
  approvedBy: string;
  approvedAt: string | null;
  approvalMethod: string;
  overallPass: boolean;
  createdAt: string;
  updatedAt: string;
}

// ── Vehicle Requests ──
export const REQUEST_STATUS = {
  REQUESTED: "requested",
  APPROVED: "approved",
  ASSIGNED: "assigned",
  REJECTED: "rejected",
  COMPLETED: "completed",
  CANCELLED: "cancelled",
} as const;

export type RequestStatus = (typeof REQUEST_STATUS)[keyof typeof REQUEST_STATUS];

export interface VehicleRequest {
  id: string;
  organizationId: string;
  requestedById: string;
  requestedByName: string;
  requestedFor: string;
  /** EHS approved_drivers.id when set via logistics picker */
  designatedOperatorId?: string | null;
  vehicleId: string | null;
  assignedVehicleId: string | null;
  assignedVehicleCode?: string;
  purpose: string;
  destination: string;
  departureDate: string;
  returnDate: string;
  passengers: string;
  requiredVehicleClass: string;
  loadoutDescription: string;
  priority: string;
  status: RequestStatus;
  approvedById: string;
  approvedByName: string;
  rejectionReason: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

// ── Scheduled Maintenance ──
export const MAINTENANCE_STATUS = {
  UPCOMING: "upcoming",
  OVERDUE: "overdue",
  COMPLETED: "completed",
} as const;

export type MaintenanceStatus = (typeof MAINTENANCE_STATUS)[keyof typeof MAINTENANCE_STATUS];

export interface ScheduledMaintenance {
  id: string;
  organizationId: string;
  vehicleId: string;
  vehicleCode?: string;
  maintenanceType: string;
  description: string;
  intervalKm: number;
  intervalMonths: number;
  lastPerformedDate: string;
  lastPerformedKm: number;
  nextDueDate: string;
  nextDueKm: number;
  status: MaintenanceStatus;
  workOrderId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Post-Deployment Checks ──
export interface PostDeploymentCheck {
  id: string;
  organizationId: string;
  vehicleId: string;
  vehicleCode?: string;
  tripId: string | null;
  mechanicId: string;
  mechanicName: string;
  checkItems: string;
  findings: string;
  workOrderIds: string;
  overallStatus: string;
  createdAt: string;
}

// ── PR Cost Cache (read-only sync from Firestore) ──
export interface PrCostCacheEntry {
  id: string;
  workOrderId: string | null;
  vehicleCode: string;
  prNumber: string;
  prStatus: string;
  approvedAmount: number;
  currency: string;
  description: string;
  lastSyncedAt: string;
}

// ── Dashboard ──
export interface DashboardStats {
  totalVehicles: number;
  operational: number;
  deployed: number;
  maintenanceHq: number;
  maintenance3rd: number;
  awaitingParts: number;
  grounded: number;
  writtenOff: number;
  openWorkOrders: number;
  avgRepairDays: number;
}
