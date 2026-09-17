import { auth } from "@/lib/auth";
import { findMatchingAdmin } from "@/lib/admin-matching";
import { db } from "@/lib/db";
import { encryptPHI, encryptDate } from "@/lib/encryption";
import { assignRepToRequest, findEligibleReps } from "@/lib/routing-engine";
import { createSalesforceCase, findCompanyByManufacturer, lookupPatientDevice } from "@/lib/salesforce";
import { createRequestSchemaForPhi } from "@/lib/validations";
import { getProviderAccess } from "@/lib/provider-access";
import { getDelegatedAdminIdsForRep } from "@/lib/admin-matching";
import {
  GENERIC_NOTIFICATION,
  logPhiAccess,
  logRoutingEvent,
  safeStatusNote,
} from "@/lib/security/audit";
import {
  sanitizeRequestForUser,
  toSessionUser,
} from "@/lib/security/sanitize-request";
import { canAccessRequestRecord } from "@/lib/security/authorization";
import { RequestUrgency } from "@prisma/client";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    if (session.user.role === "COMPANY_ADMIN" && !session.user.companyId) {
      return NextResponse.json({ error: "Company not found" }, { status: 403 });
    }

    let where: Record<string, unknown> = {};

    if (session.user.role === "PROVIDER") {
      where = { providerId: session.user.id };
    } else if (session.user.role === "REP") {
      const delegatedAdminIds = await getDelegatedAdminIdsForRep(session.user.id);
      where = {
        OR: [
          { assignedRepId: session.user.id },
          { initiatedByRepId: session.user.id },
          ...(delegatedAdminIds.length > 0
            ? [
                {
                  assignedAdminId: { in: delegatedAdminIds },
                  status: "REQUESTING",
                },
              ]
            : []),
        ],
      };
    } else if (session.user.role === "COMPANY_ADMIN") {
      const { getScopedRepIds, resolveAdminScope } = await import("@/lib/org-scope");
      const user = toSessionUser({
        id: session.user.id,
        role: session.user.role,
        companyId: session.user.companyId,
        accountState: session.user.accountState,
        adminPermissions: session.user.adminPermissions,
      });
      const scope = await resolveAdminScope(user);
      const scopedRepIds = await getScopedRepIds(user, scope);
      where = {
        companyId: session.user.companyId ?? undefined,
        OR: [
          { assignedAdminId: session.user.id },
          { escalatedToId: session.user.id },
          ...(scopedRepIds.length > 0
            ? [{ assignedRepId: { in: scopedRepIds } }]
            : []),
        ],
      };
    }

    const requests = await db.serviceRequest.findMany({
      where,
      include: {
        provider: { select: { id: true, name: true, phone: true } },
        initiatedByRep: { select: { id: true, name: true, phone: true } },
        assignedRep: { select: { id: true, name: true, phone: true } },
        assignedAdmin: { select: { id: true, name: true } },
        company: { select: { id: true, name: true } },
        statusLogs: { orderBy: { createdAt: "desc" }, take: 5 },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    const user = toSessionUser({
      id: session.user.id,
      role: session.user.role,
      companyId: session.user.companyId,
      accountState: session.user.accountState,
      adminPermissions: session.user.adminPermissions,
    });

    const delegatedAdminIds =
      user.role === "REP" ? await getDelegatedAdminIdsForRep(user.id) : [];

    const scopedRepIds =
      user.role === "COMPANY_ADMIN"
        ? await (await import("@/lib/org-scope")).getScopedRepIds(user)
        : [];

    const sanitized = requests
      .filter((r) =>
        canAccessRequestRecord(user, r, { delegatedAdminIds, scopedRepIds })
      )
      .map((r) => {
        const isDelegatedAdmin =
          user.role === "REP" &&
          Boolean(
            r.assignedAdminId && delegatedAdminIds.includes(r.assignedAdminId)
          );
        return sanitizeRequestForUser(r, user, { isDelegatedAdmin });
      });

    return NextResponse.json(sanitized);
  } catch (error) {
    console.error("GET /api/requests error:", error);
    return NextResponse.json({ error: "Failed to load requests" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await auth();
  if (
    !session?.user?.id ||
    !["PROVIDER", "REP"].includes(session.user.role)
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();

    const phiEnabled =
      session.user.role === "PROVIDER"
        ? (await getProviderAccess(session.user.id))?.canSubmitPhi ?? false
        : true;

    const schema = createRequestSchemaForPhi(phiEnabled);
    const parsed = schema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const isRepInitiated =
      session.user.role === "REP" || Boolean(data.repInitiated);

    if (isRepInitiated && session.user.role !== "REP") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let companyId = data.companyId;
    if (data.deviceManufacturer) {
      const manufacturerMatch = await findCompanyByManufacturer(data.deviceManufacturer);
      if (manufacturerMatch && manufacturerMatch.id !== companyId) {
        companyId = manufacturerMatch.id;
      }
    }

    let deviceName = data.deviceName;
    let deviceSerial = data.deviceSerial;
    let salesforceRecordId = data.salesforceRecordId;
    let crmLookupStatus = data.deviceName ? "FOUND" : "SKIPPED";

    if (
      data.deviceManufacturer &&
      data.patientName &&
      data.patientDOB &&
      !deviceName
    ) {
      const lookup = await lookupPatientDevice({
        patientName: data.patientName,
        patientDOB: data.patientDOB.slice(0, 10),
        manufacturer: data.deviceManufacturer,
      });
      crmLookupStatus = lookup.status;
      if (lookup.companyId) companyId = lookup.companyId;
      if (lookup.device) {
        deviceName = lookup.device.deviceName;
        deviceSerial = lookup.device.serialNumber;
        salesforceRecordId = lookup.salesforceRecordId ?? lookup.device.id;
      }
    }

    const dob =
      data.patientDOB && data.patientDOB.length === 10
        ? new Date(`${data.patientDOB}T00:00:00.000Z`)
        : data.patientDOB
          ? new Date(data.patientDOB)
          : null;

    const providerProfile =
      session.user.role === "PROVIDER"
        ? await db.providerProfile.findUnique({
            where: { userId: session.user.id },
          })
        : null;

    const zipCode = data.facilityZipCode.slice(0, 5);
    const matchedAdmin = await findMatchingAdmin(companyId, zipCode);

    const urgency: RequestUrgency =
      data.urgency ??
      (() => {
        const scheduled = new Date(data.scheduledAt);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const day = new Date(scheduled);
        day.setHours(0, 0, 0, 0);
        return day.getTime() === today.getTime() ? "ASAP" : "SCHEDULED";
      })();

    const scheduledAt = new Date(data.scheduledAt);
    const routingCriteria = {
      companyId,
      facilityName: data.facilityName,
      facilityLat: data.facilityLat,
      facilityLng: data.facilityLng,
      facilityZip: zipCode,
      product: data.product ?? deviceName,
      scheduledAt,
    };

    let assignRepId = isRepInitiated
      ? data.assignRepId ?? data.preferredRepId ?? null
      : data.preferredRepId ?? null;

    // Auto-assign closest available rep when provider did not pick one
    if (!assignRepId && !isRepInitiated) {
      const eligible = await findEligibleReps(routingCriteria);
      assignRepId = eligible[0]?.userId ?? null;
    }

    if (assignRepId) {
      const eligible = await findEligibleReps({
        ...routingCriteria,
        preferredRepId: assignRepId,
      });
      if (!eligible.some((r) => r.userId === assignRepId)) {
        return NextResponse.json(
          {
            error:
              "Selected rep is not available at the scheduled date and time",
          },
          { status: 400 }
        );
      }
    }

    const serviceRequest = await db.serviceRequest.create({
      data: {
        providerId: session.user.role === "PROVIDER" ? session.user.id : null,
        initiatedByRepId: isRepInitiated ? session.user.id : null,
        companyId,
        assignedAdminId: matchedAdmin?.id ?? null,
        assignedRepId: assignRepId,
        facilityName: data.facilityName,
        facilityAddr: data.facilityAddr,
        facilityPhone: data.facilityPhone,
        facilityContactName: data.facilityContactName,
        facilityContactPhone: data.facilityContactPhone,
        facilityLat: data.facilityLat,
        facilityLng: data.facilityLng,
        facilityZipCode: zipCode,
        department: data.department,
        requesterName: data.requesterName,
        requesterPhone: data.requesterPhone,
        requesterEmail: data.requesterEmail,
        requesterFax: data.requesterFax,
        patientNameEnc: data.patientName ? encryptPHI(data.patientName) : null,
        patientDOBEnc: dob ? encryptDate(dob) : null,
        patientRoomEnc: data.patientRoom ? encryptPHI(data.patientRoom) : null,
        deviceManufacturer: data.deviceManufacturer,
        deviceNameEnc: deviceName ? encryptPHI(deviceName) : null,
        deviceSerialEnc: deviceSerial ? encryptPHI(deviceSerial) : null,
        salesforceRecordId: salesforceRecordId ?? null,
        crmLookupStatus,
        procedureType: data.procedureType ?? deviceName ?? null,
        requestType: data.requestType,
        product: data.product ?? deviceName ?? null,
        urgency,
        scheduledAt,
        notes: data.notes,
        status: assignRepId ? "ACCEPTED" : "REQUESTING",
      },
    });

    const providerOrgId = providerProfile?.organizationId ?? null;

    await logRoutingEvent({
      requestId: serviceRequest.id,
      eventType: "REQUEST_CREATED",
      actorId: session.user.id,
      actorRole: session.user.role,
      organizationId: providerOrgId,
      companyId,
    });

    await logRoutingEvent({
      requestId: serviceRequest.id,
      eventType: "ROUTING_SELECTED_COMPANY",
      companyId,
      metadata: { zipCode },
    });

    if (matchedAdmin) {
      await logRoutingEvent({
        requestId: serviceRequest.id,
        eventType: "ADMIN_MATCHED",
        targetUserId: matchedAdmin.id,
        companyId,
        metadata: { zipCode },
      });
    }

    const autoAssigned = !data.preferredRepId && !data.assignRepId && assignRepId;
    const repNote = assignRepId
      ? isRepInitiated
        ? "Rep-initiated request assigned on creation"
        : autoAssigned
          ? "Auto-assigned to closest available rep"
          : "Provider requested a specific rep"
      : null;

    await db.requestStatusLog.create({
      data: {
        requestId: serviceRequest.id,
        status: serviceRequest.status,
        note: safeStatusNote(
          repNote ??
            (crmLookupStatus === "FOUND"
              ? "CRM device lookup succeeded"
              : matchedAdmin
                ? `Routed to admin for zip ${zipCode}`
                : "Request submitted — awaiting admin assignment")
        ),
      },
    });

    const salesforceCaseId = await createSalesforceCase({
      companyId,
      requestId: serviceRequest.id,
      subject: `GoRepYo request ${serviceRequest.id.slice(0, 8)}`,
      description: [
        `Request ID: ${serviceRequest.id}`,
        `Manufacturer: ${data.deviceManufacturer ?? "N/A"}`,
        `Scheduled: ${scheduledAt.toISOString()}`,
        "Patient identifiers stored in GoRepYo only.",
      ].join("\n"),
    });

    if (salesforceCaseId) {
      await db.serviceRequest.update({
        where: { id: serviceRequest.id },
        data: { salesforceCaseId },
      });
    }

    if (providerProfile && session.user.role === "PROVIDER") {
      await db.providerProfile.update({
        where: { userId: session.user.id },
        data: {
          facilityName: data.facilityName,
          facilityAddress: data.facilityAddr,
          facilityContactName: data.facilityContactName,
          facilityContactPhone: data.facilityContactPhone,
          department: data.department ?? providerProfile.department,
          zipCode: zipCode,
          requesterPhone: data.requesterPhone,
          requesterFax: data.requesterFax ?? providerProfile.requesterFax,
        },
      });
    }

    if (assignRepId) {
      const assignResult = await assignRepToRequest(
        serviceRequest.id,
        assignRepId,
        routingCriteria,
        { id: session.user.id, role: session.user.role }
      );
      if (!assignResult.assigned) {
        await db.serviceRequest.delete({ where: { id: serviceRequest.id } });
        return NextResponse.json(
          { error: assignResult.error ?? "Failed to assign rep" },
          { status: 400 }
        );
      }
    } else {
      const notifyUserId =
        matchedAdmin?.delegationActive && matchedAdmin.delegatedRepId
          ? matchedAdmin.delegatedRepId
          : matchedAdmin?.id;

      if (notifyUserId) {
        await db.notification.create({
          data: {
            userId: notifyUserId,
            title: GENERIC_NOTIFICATION.newRequest.title,
            body: GENERIC_NOTIFICATION.newRequest.body,
            type: "REQUEST_ASSIGNED",
            data: { requestId: serviceRequest.id },
          },
        });
        await logPhiAccess({
          requestId: serviceRequest.id,
          userId: notifyUserId,
          userRole: "COMPANY_ADMIN",
          accessType: "NOTIFICATION_SENT",
          companyId,
          metadata: { notificationType: "NEW_REQUEST" },
        });
      }
    }

    const sessionUser = toSessionUser({
      id: session.user.id,
      role: session.user.role,
      companyId: session.user.companyId,
      accountState: session.user.accountState,
      adminPermissions: session.user.adminPermissions,
    });

    return NextResponse.json(
      {
        request: sanitizeRequestForUser(
          await db.serviceRequest.findUniqueOrThrow({
            where: { id: serviceRequest.id },
          }),
          sessionUser
        ),
        matchedAdmin: matchedAdmin
          ? { id: matchedAdmin.id, name: matchedAdmin.name }
          : null,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/requests error:", error);
    return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
  }
}
