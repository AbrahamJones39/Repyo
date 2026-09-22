import { decryptPHI, decryptDate } from "@/lib/encryption";
import type { SessionUser } from "@/lib/security/authorization";
import {
  canViewDeviceIdentifiers,
  canViewRequestPhi,
} from "@/lib/security/authorization";
import type { RequestStatus, Role } from "@prisma/client";

type RawRequest = {
  id: string;
  providerId: string | null;
  assignedRepId: string | null;
  assignedAdminId: string | null;
  initiatedByRepId: string | null;
  companyId: string;
  status: RequestStatus;
  acknowledgedAt?: Date | null;
  alertActive?: boolean;
  facilityName: string;
  facilityAddr: string;
  facilityZipCode: string | null;
  department: string | null;
  procedureType: string | null;
  requestType: string;
  product: string | null;
  urgency: string;
  scheduledAt: Date;
  notes: string | null;
  deviceManufacturer: string | null;
  patientNameEnc: string | null;
  patientDOBEnc: string | null;
  patientRoomEnc: string | null;
  deviceNameEnc: string | null;
  deviceSerialEnc: string | null;
  crmLookupStatus: string | null;
  recordLifecycle?: string;
  [key: string]: unknown;
};

export function sanitizeRequestForUser(
  request: RawRequest,
  user: SessionUser,
  options?: { isDelegatedAdmin?: boolean }
) {
  const {
    patientNameEnc,
    patientDOBEnc,
    patientRoomEnc,
    deviceNameEnc,
    deviceSerialEnc,
    ...base
  } = request;

  const phiAllowed = canViewRequestPhi(user, request, options);
  const deviceAllowed = canViewDeviceIdentifiers(user, request, options);
  const repMustAcknowledge =
    user.role === "REP" &&
    request.assignedRepId === user.id &&
    !request.acknowledgedAt &&
    (request.status === "REQUESTING" || request.status === "ACCEPTED");

  const isPreAcceptance =
    user.role !== "PROVIDER" &&
    !request.acknowledgedAt &&
    (request.status === "REQUESTING" || repMustAcknowledge);

  const sanitized = {
    ...base,
    patientNameEnc: undefined,
    patientDOBEnc: undefined,
    patientRoomEnc: undefined,
    deviceNameEnc: undefined,
    deviceSerialEnc: undefined,
    phiRestricted: !phiAllowed,
    identifiersHidden: isPreAcceptance && user.role !== "PROVIDER",
    acknowledgedAt: request.acknowledgedAt?.toISOString?.() ?? request.acknowledgedAt ?? null,
    alertActive: request.alertActive ?? false,
  };

  if (phiAllowed) {
    Object.assign(sanitized, {
      patientName: patientNameEnc ? decryptPHI(patientNameEnc) : null,
      patientDOB: patientDOBEnc
        ? decryptDate(patientDOBEnc).toISOString()
        : null,
      patientRoom: patientRoomEnc ? decryptPHI(patientRoomEnc) : null,
    });
  }

  if (deviceAllowed) {
    Object.assign(sanitized, {
      deviceName: deviceNameEnc ? decryptPHI(deviceNameEnc) : null,
      deviceSerial: deviceSerialEnc ? decryptPHI(deviceSerialEnc) : null,
    });
  } else if (isPreAcceptance) {
    Object.assign(sanitized, {
      deviceManufacturer: undefined,
      crmLookupStatus: undefined,
    });
  }

  const rawReplies = Array.isArray(request.replies) ? request.replies : [];
  const replies = rawReplies
    .filter((reply) => reply && typeof reply === "object" && "id" in reply)
    .map((reply) => {
      const item = reply as {
        id: string;
        body: string;
        createdAt: Date | string;
        author?: { id: string; name: string; role: Role };
      };
      return {
        id: item.id,
        body: item.body,
        createdAt:
          item.createdAt instanceof Date
            ? item.createdAt.toISOString()
            : item.createdAt,
        author: item.author ?? { id: "", name: "Unknown", role: "REP" as Role },
      };
    });

  if (isPreAcceptance && user.role === "REP") {
    return {
      ...sanitized,
      notes: sanitized.notes ? "[Open request to view details]" : null,
      requesterName: undefined,
      requesterPhone: undefined,
      requesterEmail: undefined,
      requesterFax: undefined,
      physicianName: undefined,
      replies: replies.map((reply) => ({
        ...reply,
        body: "[Open request to view note]",
      })),
    };
  }

  return { ...sanitized, replies };
}

export async function getProviderOrgContext(userId: string) {
  const { db } = await import("@/lib/db");
  const profile = await db.providerProfile.findUnique({
    where: { userId },
    select: { organizationId: true },
  });
  return profile?.organizationId ?? null;
}

export function toSessionUser(user: {
  id: string;
  role: Role;
  companyId: string | null;
  accountState?: SessionUser["accountState"];
  adminPermissions?: string[];
}): SessionUser {
  return {
    id: user.id,
    role: user.role,
    companyId: user.companyId,
    accountState: user.accountState,
    adminPermissions: user.adminPermissions,
  };
}
