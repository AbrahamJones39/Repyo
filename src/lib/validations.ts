import { z } from "zod";
import { RequestType, RequestUrgency } from "@prisma/client";

const zipSchema = z.string().regex(/^\d{5}$/, "Valid 5-digit zip code required");

export const createRequestSchema = z
  .object({
    companyId: z.string().uuid(),
    facilityName: z.string().min(1, "Facility name is required"),
    facilityAddr: z.string().min(1, "Facility address is required"),
    facilityZipCode: zipSchema,
    facilityContactName: z.string().min(1, "Facility contact name is required"),
    facilityContactPhone: z.string().min(1, "Facility contact phone is required"),
    department: z.string().optional(),
    facilityPhone: z.string().optional(),
    facilityLat: z.number().optional(),
    facilityLng: z.number().optional(),
    requesterName: z.string().min(1, "Requester name is required"),
    requesterPhone: z.string().min(1, "Requester phone is required"),
    requesterEmail: z.string().email("Valid requester email required"),
    requesterFax: z.string().optional(),
    requestType: z.nativeEnum(RequestType),
    procedureType: z.string().optional(),
    patientName: z.string().optional(),
    patientDOB: z
      .string()
      .optional()
      .refine(
        (v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isNaN(Date.parse(v)),
        "Invalid date"
      ),
    patientRoom: z.string().optional(),
    product: z.string().optional(),
    urgency: z.nativeEnum(RequestUrgency).optional(),
    scheduledAt: z.string().datetime(),
    notes: z.string().optional(),
    preferredRepId: z.string().uuid().optional(),
    repInitiated: z.boolean().optional(),
    assignRepId: z.string().uuid().optional(),
    deviceManufacturer: z.string().optional(),
    deviceName: z.string().optional(),
    deviceSerial: z.string().optional(),
    salesforceRecordId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.requestType === "CASE") {
      if (!data.procedureType?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Procedure type is required",
          path: ["procedureType"],
        });
      }
      if (!data.patientName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Patient name is required",
          path: ["patientName"],
        });
      }
      if (!data.patientDOB?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Patient date of birth is required",
          path: ["patientDOB"],
        });
      }
      if (!data.patientRoom?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Patient room number is required",
          path: ["patientRoom"],
        });
      }
    } else if (!data.notes?.trim() && !data.procedureType?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Appointment details are required",
        path: ["notes"],
      });
    } else {
      if (!data.patientName?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Patient name is required",
          path: ["patientName"],
        });
      }
      if (!data.patientDOB?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Patient date of birth is required",
          path: ["patientDOB"],
        });
      }
    }

    if (data.repInitiated && !data.assignRepId && !data.preferredRepId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a rep to assign this request to",
        path: ["assignRepId"],
      });
    }

    if (!data.deviceManufacturer?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Device manufacturer is required",
        path: ["deviceManufacturer"],
      });
    }
  });

export const deviceLookupSchema = z.object({
  patientName: z.string().min(1, "Patient name is required"),
  patientDOB: z
    .string()
    .min(1, "Patient date of birth is required")
    .refine(
      (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) || !Number.isNaN(Date.parse(v)),
      "Invalid date"
    ),
  manufacturer: z.string().min(1, "Manufacturer is required"),
});

export const updateRequestStatusSchema = z.object({
  status: z.enum([
    "REQUESTING",
    "ACCEPTED",
    "EN_ROUTE",
    "ARRIVED",
    "COMPLETED",
    "CANCELLED",
    "DECLINED",
  ]),
  lat: z.number().optional(),
  lng: z.number().optional(),
  note: z.string().optional(),
});

export const forwardRequestSchema = z.object({
  action: z.literal("FORWARD"),
  forwardedToId: z.string().uuid(),
  reason: z.string().max(500).optional(),
  targetTeamId: z.string().uuid().optional(),
});

export const declineRequestSchema = z.object({
  action: z.literal("DECLINE"),
  reason: z.string().max(500).optional(),
});

export const assignRepSchema = z.object({
  repId: z.string().uuid(),
});

export const updateDelegationSchema = z.object({
  repId: z.string().uuid().nullable(),
  active: z.boolean(),
});

export const updateRepStatusSchema = z.object({
  status: z.enum(["AVAILABLE", "BUSY", "OFF_DUTY", "VACATION"]),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const updateRepLocationSchema = z.object({
  lat: z.number(),
  lng: z.number(),
});

export const updateRepProfileSchema = z.object({
  status: z.enum(["AVAILABLE", "BUSY", "OFF_DUTY", "VACATION"]).optional(),
  onCallEnabled: z.boolean().optional(),
  travelRadiusMiles: z.number().min(1).max(500).optional(),
  maxTravelDistance: z.number().min(1).max(500).optional(),
  products: z.array(z.string()).optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
});

export const updateTerritorySchema = z.object({
  territories: z.array(
    z.object({
      state: z.string().optional(),
      county: z.string().optional(),
      zipCode: z.string().optional(),
    })
  ),
});

export const updateRepCredentialSchema = z.object({
  credentialStatus: z.enum(["ACTIVE", "PENDING", "EXPIRED", "REVOKED"]),
});

const timeSchema = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:mm format");

export const updateScheduleRulesSchema = z.object({
  rules: z.array(
    z.object({
      dayOfWeek: z.number().int().min(0).max(6),
      startTime: timeSchema,
      endTime: timeSchema,
    })
  ),
});

export const createAvailabilityBlockSchema = z.object({
  type: z.enum(["VACATION", "OFF"]).default("VACATION"),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  note: z.string().optional(),
});

export const createRepSchema = z.object({
  name: z.string().min(2, "Name is required"),
  email: z.string().email("Valid email required"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  phone: z.string().optional(),
  managerId: z.string().uuid("Designated manager is required"),
  orgUnitId: z.string().uuid().optional(),
  credentialStatus: z
    .enum(["ACTIVE", "PENDING", "EXPIRED", "REVOKED"])
    .default("ACTIVE"),
  status: z
    .enum(["AVAILABLE", "BUSY", "OFF_DUTY", "VACATION"])
    .default("AVAILABLE"),
  products: z.array(z.string()).default([]),
});

export const createOrgUnitSchema = z.object({
  name: z.string().min(1, "Name is required"),
  typeLabel: z.string().min(1).max(60).default("Unit"),
  parentId: z.string().uuid().nullable().optional(),
});

export const updateOrgUnitSchema = z.object({
  name: z.string().min(1).optional(),
  typeLabel: z.string().min(1).max(60).optional(),
  parentId: z.string().uuid().nullable().optional(),
  sortOrder: z.number().int().optional(),
});

export const orgUnitAssignmentSchema = z.object({
  userId: z.string().uuid(),
  permissions: z.array(z.string()).optional(),
  typeLabel: z.string().min(1).max(60).optional(),
  managerId: z.string().uuid().nullable().optional(),
});

export const updateMemberScopeSchema = z.object({
  managerId: z.string().uuid().nullable().optional(),
  orgUnitId: z.string().uuid().nullable().optional(),
  permissions: z.array(z.string()).optional(),
});

export const createCompanySchema = z.object({
  name: z.string().min(2),
  products: z.array(z.string()).default([]),
});

export const updateCompanySchema = z.object({
  name: z.string().min(2).optional(),
  products: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  userVerificationMethod: z
    .enum([
      "MANUAL_ADMIN_APPROVAL",
      "APPROVED_EMAIL_DOMAIN",
      "EMAIL_DOMAIN_PLUS_ADMIN_APPROVAL",
      "INVITATION_ONLY",
      "PREAPPROVED_ROSTER",
      "SSO",
      "SCIM",
      "API_DIRECTORY_VERIFICATION",
    ])
    .optional(),
  approvedEmailDomains: z.array(z.string()).optional(),
  ssoEnabled: z.boolean().optional(),
  scimEnabled: z.boolean().optional(),
  forwardEnabled: z.boolean().optional(),
  forwardTeamMembersOnly: z.boolean().optional(),
  forwardAllowManagers: z.boolean().optional(),
});

export const updateUserSchema = z.object({
  role: z.enum(["SUPER_ADMIN", "COMPANY_ADMIN", "REP", "PROVIDER"]).optional(),
  companyId: z.string().uuid().nullable().optional(),
});

export const providerOnboardingSchema = z.object({
  step: z.number().int().min(1).max(3),
  organizationId: z.string().uuid().optional(),
  requestNewOrg: z.boolean().optional(),
  requestedOrgName: z.string().optional(),
  workEmail: z.string().email().optional(),
  facilityName: z.string().optional(),
  facilityAddress: z.string().optional(),
  facilityContactName: z.string().optional(),
  facilityContactPhone: z.string().optional(),
  department: z.string().optional(),
  zipCode: z.string().optional(),
  requesterPhone: z.string().optional(),
  requesterFax: z.string().optional(),
  facilityId: z.string().uuid().optional(),
  acceptTerms: z.boolean().optional(),
  acceptUserAgreement: z.boolean().optional(),
  acceptProviderOrgAuth: z.boolean().optional(),
  acceptProviderUserAgreement: z.boolean().optional(),
  acceptProviderPhiUse: z.boolean().optional(),
  acceptProviderNotEmergency: z.boolean().optional(),
  acceptProviderPrivacyAck: z.boolean().optional(),
  acceptProviderElectronicComm: z.boolean().optional(),
});

export const createNonPhiRequestSchema = z
  .object({
    companyId: z.string().uuid(),
    facilityName: z.string().min(1, "Facility name is required"),
    facilityAddr: z.string().min(1, "Facility address is required"),
    facilityZipCode: zipSchema,
    facilityContactName: z.string().min(1, "Facility contact name is required"),
    facilityContactPhone: z.string().min(1, "Facility contact phone is required"),
    department: z.string().optional(),
    facilityPhone: z.string().optional(),
    facilityLat: z.number().optional(),
    facilityLng: z.number().optional(),
    requesterName: z.string().min(1, "Requester name is required"),
    requesterPhone: z.string().min(1, "Requester phone is required"),
    requesterEmail: z.string().email("Valid requester email required"),
    requesterFax: z.string().optional(),
    requestType: z.nativeEnum(RequestType),
    procedureType: z.string().optional(),
    product: z.string().optional(),
    urgency: z.nativeEnum(RequestUrgency).optional(),
    scheduledAt: z.string().datetime(),
    notes: z.string().optional(),
    preferredRepId: z.string().uuid().optional(),
    repInitiated: z.boolean().optional(),
    assignRepId: z.string().uuid().optional(),
    patientName: z.string().optional(),
    patientDOB: z.string().optional(),
    patientRoom: z.string().optional(),
    deviceManufacturer: z.string().optional(),
    deviceName: z.string().optional(),
    deviceSerial: z.string().optional(),
    salesforceRecordId: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.requestType === "CASE" && !data.procedureType?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Procedure type is required",
        path: ["procedureType"],
      });
    }
    if (data.requestType === "CHECK" && !data.notes?.trim() && !data.procedureType?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Appointment details are required",
        path: ["notes"],
      });
    }
    if (data.repInitiated && !data.assignRepId && !data.preferredRepId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Select a rep to assign this request to",
        path: ["assignRepId"],
      });
    }
  });

export function createRequestSchemaForPhi(phiEnabled: boolean) {
  return phiEnabled ? createRequestSchema : createNonPhiRequestSchema;
}

export const signupSchema = z
  .object({
    name: z.string().min(2, "Name is required"),
    email: z.string().email("Valid email required"),
    password: z.string().min(8, "Password must be at least 8 characters"),
    role: z.enum(["PROVIDER", "REP", "COMPANY_ADMIN"]),
    companyId: z.string().uuid().optional(),
    facilityName: z.string().optional(),
    facilityAddress: z.string().optional(),
    department: z.string().optional(),
    zipCode: z.string().optional(),
    facilityContactName: z.string().optional(),
    facilityContactPhone: z.string().optional(),
    requesterPhone: z.string().optional(),
    requesterFax: z.string().optional(),
    zipCodeStart: z.string().optional(),
    zipCodeEnd: z.string().optional(),
    organizationId: z.string().uuid().optional(),
    requestedOrgName: z.string().optional(),
    requestOrgAccess: z.boolean().optional(),
    acceptProviderAuthorization: z.boolean().optional(),
    acceptProviderPrivacy: z.boolean().optional(),
    acceptOrgAdminAcknowledgment: z.boolean().optional(),
    acceptTermsAndPrivacy: z.boolean().optional(),
    acceptProviderOrgAuth: z.boolean().optional(),
    acceptProviderUserAgreement: z.boolean().optional(),
    acceptProviderPhiUse: z.boolean().optional(),
    acceptProviderNotEmergency: z.boolean().optional(),
    acceptProviderPrivacyAck: z.boolean().optional(),
    acceptProviderElectronicComm: z.boolean().optional(),
    siteIds: z.string().optional(),
    primarySiteId: z.string().uuid().optional(),
    inviteToken: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (["REP", "COMPANY_ADMIN"].includes(data.role) && !data.companyId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Device company is required for this role",
        path: ["companyId"],
      });
    }
    if (data.role === "PROVIDER") {
      const hasOrg =
        Boolean(data.organizationId?.trim()) ||
        Boolean(data.requestedOrgName?.trim());
      if (!hasOrg) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Select your healthcare organization or request access for your facility",
          path: ["organizationId"],
        });
      }
      const required: { key: keyof typeof data; label: string }[] = [
        { key: "facilityName", label: "Facility name" },
        { key: "facilityAddress", label: "Facility address" },
        { key: "zipCode", label: "Zip code" },
        { key: "facilityContactName", label: "Facility contact name" },
        { key: "facilityContactPhone", label: "Facility contact phone" },
        { key: "requesterPhone", label: "Your phone number" },
      ];
      for (const field of required) {
        const value = data[field.key];
        if (typeof value !== "string" || !value.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `${field.label} is required for providers`,
            path: [field.key],
          });
        }
      }
    }
    if (data.role === "COMPANY_ADMIN") {
      if (!data.zipCodeStart?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Starting zip code is required for company admins",
          path: ["zipCodeStart"],
        });
      }
      if (!data.zipCodeEnd?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Ending zip code is required for company admins",
          path: ["zipCodeEnd"],
        });
      }
    }
    if (data.role === "PROVIDER") {
      const providerChecks = [
        {
          key: "acceptProviderOrgAuth" as const,
          message:
            "You must confirm you are authorized by the healthcare organization identified above",
        },
        {
          key: "acceptProviderUserAgreement" as const,
          message:
            "You must agree to the RepYo healthcare provider user agreement",
        },
        {
          key: "acceptProviderPhiUse" as const,
          message:
            "You must acknowledge the protected health information requirements",
        },
        {
          key: "acceptProviderNotEmergency" as const,
          message:
            "You must acknowledge that RepYo is not an emergency service, EHR, or substitute for clinical communication",
        },
        {
          key: "acceptProviderPrivacyAck" as const,
          message:
            "You must acknowledge that you have been provided access to the RepYo privacy policy",
        },
        {
          key: "acceptProviderElectronicComm" as const,
          message:
            "You must consent to electronic service, security, scheduling, request status, and account communication",
        },
      ];
      for (const field of providerChecks) {
        if (!data[field.key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: field.message,
            path: [field.key],
          });
        }
      }
    } else {
      if (!data.acceptProviderAuthorization) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "You must confirm you are authorized to use RepYo and agree to the Terms of Use and the user agreement for your account type",
          path: ["acceptProviderAuthorization"],
        });
      }
      if (!data.acceptProviderPrivacy) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "You must acknowledge the Privacy Policy and consent to necessary electronic communications",
          path: ["acceptProviderPrivacy"],
        });
      }
      if (data.role === "COMPANY_ADMIN" && !data.acceptOrgAdminAcknowledgment) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "You must confirm you are authorized to act as a RepYo organization administrator and agree to the organization administrator acknowledgment",
          path: ["acceptOrgAdminAcknowledgment"],
        });
      }
    }
  });

const optionalText = z
  .string()
  .max(200)
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null) return v;
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  });

const optionalZip = z
  .string()
  .optional()
  .nullable()
  .transform((v) => {
    if (v == null) return v;
    const trimmed = v.trim();
    return trimmed === "" ? null : trimmed;
  })
  .refine((v) => v == null || /^\d{5}$/.test(v), "Valid 5-digit zip code required");

export const updateOwnProfileSchema = z.object({
  name: z.string().min(2, "Name is required").optional(),
  phone: optionalText,
  zipCodeStart: optionalZip,
  zipCodeEnd: optionalZip,
  status: z.enum(["AVAILABLE", "BUSY", "OFF_DUTY", "VACATION"]).optional(),
  onCallEnabled: z.boolean().optional(),
  products: z.array(z.string()).optional(),
  jobTitle: optionalText,
  department: optionalText,
  facilityName: optionalText,
  facilityAddress: z
    .string()
    .max(300)
    .optional()
    .nullable()
    .transform((v) => {
      if (v == null) return v;
      const trimmed = v.trim();
      return trimmed === "" ? null : trimmed;
    }),
  facilityPhone: optionalText,
  facilityContactName: optionalText,
  facilityContactPhone: optionalText,
  zipCode: optionalZip,
  requesterPhone: optionalText,
  requesterFax: optionalText,
  defaultPhysician: optionalText,
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(8, "Password must be at least 8 characters"),
});
