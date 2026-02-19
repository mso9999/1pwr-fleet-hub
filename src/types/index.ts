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
  MAINTENANCE_HQ: "maintenance-hq",
  MAINTENANCE_3RD: "maintenance-3rdparty",
  AWAITING_PARTS: "awaiting-parts",
  GROUNDED: "grounded",
  WRITTEN_OFF: "written-off",
} as const;

export type VehicleStatus = (typeof VEHICLE_STATUS)[keyof typeof VEHICLE_STATUS];

export const ASSET_CLASS = {
  LIGHT: "light-vehicle",
  HEAVY: "heavy-vehicle",
  EQUIPMENT: "equipment",
} as const;

export type AssetClass = (typeof ASSET_CLASS)[keyof typeof ASSET_CLASS];

export const TRACKER_STATUS = {
  ACTIVE: "active",
  INACTIVE: "inactive",
  NO_SIGNAL: "no-signal",
  NOT_INSTALLED: "not-installed",
  UNKNOWN: "unknown",
} as const;

export type TrackerStatus = (typeof TRACKER_STATUS)[keyof typeof TRACKER_STATUS];

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
  trackerImei: string;
  trackerProvider: string;
  trackerSim: string;
  trackerModel: string;
  trackerInstallDate: string;
  trackerStatus: TrackerStatus;
  createdAt: string;
  updatedAt: string;
}

// ── Trips ──
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
  passengers: string;
  loadOut: string;
  loadIn: string;
  checkoutAt: string;
  checkinAt: string | null;
  issuesObserved: string;
  distance: number | null;
  source: string;
  stops?: TripStop[];
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
  AWAITING_PARTS: "awaiting-parts",
  COMPLETED: "completed",
  CLOSED: "closed",
  RETURN_REPAIR: "return-repair",
  CANCELLED: "cancelled",
  REJECTED: "rejected",
} as const;

export type WorkOrderStatus = (typeof WORK_ORDER_STATUS)[keyof typeof WORK_ORDER_STATUS];

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

export interface FieldIssueReport {
  id: string;
  organizationId: string;
  vehicleId: string;
  vehicleCode?: string;
  vehicleMake?: string;
  vehicleModel?: string;
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
