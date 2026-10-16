/**
 * Refill the App Store review demo account (appreview@gorepyo.com) with sample data.
 *
 * Only touches rows this script created (tagged salesforceRecordId = DEMO_TAG),
 * so it is safe to re-run whenever a reviewer has completed or declined the demo cases.
 *
 *   npx tsx --env-file=.env scripts/seed-appreview.ts          # dry run
 *   npx tsx --env-file=.env scripts/seed-appreview.ts --apply  # write
 */
import { PrismaClient, RequestStatus, RequestUrgency } from "@prisma/client";
import { decryptPHI, encryptDate, encryptPHI } from "../src/lib/encryption";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const EMAIL = "appreview@gorepyo.com";
const DEMO_TAG = "APPREVIEW_DEMO";

function at(daysFromNow: number, hour: number, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  return d;
}

function minutesFromNow(m: number) {
  return new Date(Date.now() + m * 60_000);
}

type DemoCase = {
  status: RequestStatus;
  urgency: RequestUrgency;
  scheduledAt: Date;
  department: string;
  physicianName: string;
  patientName: string;
  patientDOB: string;
  patientRoom: string;
  procedureType: string;
  notes: string;
  history: RequestStatus[];
};

const cases: DemoCase[] = [
  {
    status: "REQUESTING",
    urgency: "ASAP",
    scheduledAt: minutesFromNow(60),
    department: "EP Lab",
    physicianName: "Dr. Sarah Chen",
    patientName: "Robert Martinez",
    patientDOB: "1958-03-12",
    patientRoom: "EP 2",
    procedureType: "ICD interrogation",
    notes: "Patient shocked overnight. Need device interrogation before discharge.",
    history: ["REQUESTING"],
  },
  {
    status: "ACCEPTED",
    urgency: "SAME_DAY",
    scheduledAt: minutesFromNow(240),
    department: "Cath Lab",
    physicianName: "Dr. James Patel",
    patientName: "Linda Nguyen",
    patientDOB: "1949-11-02",
    patientRoom: "Cath 3",
    procedureType: "Pacemaker implant",
    notes: "Dual-chamber implant, second case of the afternoon.",
    history: ["REQUESTING", "ACCEPTED"],
  },
  {
    status: "ACCEPTED",
    urgency: "SCHEDULED",
    scheduledAt: at(1, 8),
    department: "OR 4",
    physicianName: "Dr. Emily Brooks",
    patientName: "Thomas Wright",
    patientDOB: "1962-07-21",
    patientRoom: "Pre-op 6",
    procedureType: "Generator change",
    notes: "First case. Please arrive 30 minutes early for setup.",
    history: ["REQUESTING", "ACCEPTED"],
  },
  {
    status: "ACCEPTED",
    urgency: "SCHEDULED",
    scheduledAt: at(3, 13),
    department: "EP Lab",
    physicianName: "Dr. Sarah Chen",
    patientName: "Maria Gonzalez",
    patientDOB: "1971-01-30",
    patientRoom: "EP 1",
    procedureType: "Loop recorder implant",
    notes: "",
    history: ["REQUESTING", "ACCEPTED"],
  },
  {
    status: "ACCEPTED",
    urgency: "SCHEDULED",
    scheduledAt: at(8, 9, 30),
    department: "Cath Lab",
    physicianName: "Dr. James Patel",
    patientName: "Kevin O'Brien",
    patientDOB: "1955-05-14",
    patientRoom: "Cath 1",
    procedureType: "CRT-D upgrade",
    notes: "Bring programmer and backup leads.",
    history: ["REQUESTING", "ACCEPTED"],
  },
  {
    status: "COMPLETED",
    urgency: "SCHEDULED",
    scheduledAt: at(-1, 10),
    department: "OR 2",
    physicianName: "Dr. Emily Brooks",
    patientName: "Susan Clark",
    patientDOB: "1966-09-08",
    patientRoom: "OR 2",
    procedureType: "Pacemaker follow-up",
    notes: "",
    history: ["REQUESTING", "ACCEPTED", "EN_ROUTE", "ARRIVED", "COMPLETED"],
  },
];

async function main() {
  const user = await db.user.findUnique({ where: { email: EMAIL } });
  if (!user) throw new Error(`${EMAIL} not found`);
  if (user.role !== "REP") throw new Error(`${EMAIL} is ${user.role}, expected REP`);

  // Reuse the facility / provider / company wiring from the account's existing real request.
  const template = await db.serviceRequest.findFirst({
    where: {
      assignedRepId: user.id,
      OR: [{ salesforceRecordId: null }, { NOT: { salesforceRecordId: DEMO_TAG } }],
    },
    orderBy: { createdAt: "asc" },
  });
  if (!template) throw new Error("No existing request to copy facility/company from");

  // Fails loudly if our PHI key doesn't match the one the deployed site used.
  if (template.patientNameEnc) decryptPHI(template.patientNameEnc);

  const existing = await db.serviceRequest.count({
    where: { assignedRepId: user.id, salesforceRecordId: DEMO_TAG },
  });
  console.log(
    `${EMAIL}: template request ${template.id} at "${template.facilityName}". ` +
      `Will replace ${existing} old demo request(s) with ${cases.length} new ones.`
  );
  if (!APPLY) {
    console.log("Dry run. Re-run with --apply to write.");
    return;
  }

  await db.$transaction(
    async (tx) => {
      const old = await tx.serviceRequest.findMany({
        where: { assignedRepId: user.id, salesforceRecordId: DEMO_TAG },
        select: { id: true },
      });
      const oldIds = old.map((r) => r.id);
      if (oldIds.length > 0) {
        await tx.notification.deleteMany({ where: { userId: user.id, requestId: { in: oldIds } } });
        await tx.requestStatusLog.deleteMany({ where: { requestId: { in: oldIds } } });
        await tx.serviceRequest.deleteMany({ where: { id: { in: oldIds } } });
      }

      for (const c of cases) {
        const accepted = c.history.includes("ACCEPTED");
        const req = await tx.serviceRequest.create({
          data: {
            salesforceRecordId: DEMO_TAG,
            providerId: template.providerId,
            companyId: template.companyId,
            assignedAdminId: template.assignedAdminId,
            assignedRepId: user.id,
            assignedAt: minutesFromNow(-30),
            healthcareSiteId: template.healthcareSiteId,
            teamId: template.teamId,
            facilityName: template.facilityName,
            facilityAddr: template.facilityAddr,
            facilityPhone: template.facilityPhone,
            facilityContactName: template.facilityContactName,
            facilityContactPhone: template.facilityContactPhone,
            facilityLat: template.facilityLat,
            facilityLng: template.facilityLng,
            facilityZipCode: template.facilityZipCode,
            requesterName: template.requesterName,
            requesterPhone: template.requesterPhone,
            requesterEmail: template.requesterEmail,
            department: c.department,
            physicianName: c.physicianName,
            patientNameEnc: encryptPHI(c.patientName),
            patientDOBEnc: encryptDate(new Date(c.patientDOB)),
            patientRoomEnc: encryptPHI(c.patientRoom),
            procedureType: c.procedureType,
            product: template.product,
            urgency: c.urgency,
            scheduledAt: c.scheduledAt,
            status: c.status,
            notes: c.notes || null,
            acceptedAt: accepted ? minutesFromNow(-20) : null,
            acknowledgedAt: accepted ? minutesFromNow(-20) : null,
            acknowledgedById: accepted ? user.id : null,
          },
        });

        for (const [i, status] of c.history.entries()) {
          await tx.requestStatusLog.create({
            data: {
              requestId: req.id,
              status,
              note: status === "REQUESTING" ? "Request submitted" : `Status set to ${status}`,
              createdAt: minutesFromNow(-30 + i * 5),
            },
          });
        }

        if (c.status === "REQUESTING" || c.urgency === "SAME_DAY") {
          await tx.notification.create({
            data: {
              userId: user.id,
              requestId: req.id,
              title: c.status === "REQUESTING" ? "New case request" : "Case accepted",
              body: `${c.procedureType} at ${template.facilityName}`,
              type: c.status === "REQUESTING" ? "NEW_REQUEST" : "REQUEST_UPDATE",
              data: { demo: DEMO_TAG },
              priority: c.urgency === "ASAP" ? "HIGH" : "NORMAL",
            },
          });
        }
      }
    },
    { timeout: 60_000 }
  );

  console.log(`Created ${cases.length} demo requests for ${EMAIL}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
