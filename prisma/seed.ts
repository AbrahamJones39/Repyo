import { PrismaClient, RequestStatus } from "@prisma/client";
import bcrypt from "bcryptjs";
import { encryptPHI, encryptDate } from "../src/lib/encryption";
import { LEGAL_DOCUMENTS } from "../src/lib/legal/documents";
import { importHealthcareSitesFromJson, linkSiteToOrganization } from "../src/lib/healthcare-sites/service";
import type { HealthcareSiteInput } from "../src/lib/healthcare-sites/normalize";
import arizonaSites from "../data/arizona-healthcare-sites.json";

const db = new PrismaClient();

const DEMO_PASSWORD = "demo123";
const DEMO_EMAILS = [
  "provider@demo.com",
  "provider2@demo.com",
  "rep@demo.com",
  "rep2@demo.com",
  "rep3@demo.com",
  "manager@demo.com",
  "admin@demo.com",
  "admin2@demo.com",
  "super@demo.com",
];

type DeviceCompanySeed = {
  name: string;
  slug: string;
  products: string[];
  manufacturerAliases: string[];
  userVerificationMethod?: "APPROVED_EMAIL_DOMAIN";
  approvedEmailDomains?: string[];
};

/** Active device companies shown in request + signup company selects. */
const DEVICE_COMPANIES: DeviceCompanySeed[] = [
  {
    name: "Abbott",
    slug: "abbott",
    products: ["PPM", "ICD", "CRT-D", "CRT-P", "Leadless PPM", "Structural Heart"],
    manufacturerAliases: ["Abbott Laboratories", "ABT", "St. Jude", "St Jude Medical", "SJM"],
  },
  {
    name: "Abiomed",
    slug: "abiomed",
    products: ["Structural Heart", "Other"],
    manufacturerAliases: ["Abiomed Inc", "Impella"],
  },
  {
    name: "AtriCure",
    slug: "atricure",
    products: ["Ablation", "Structural Heart"],
    manufacturerAliases: ["AtriCure Inc"],
  },
  {
    name: "Biotronik",
    slug: "biotronik",
    products: ["PPM", "ICD", "CRT-D", "CRT-P", "Loop"],
    manufacturerAliases: ["BIOTRONIK", "Biotronik SE"],
  },
  {
    name: "Boston Scientific",
    slug: "boston-scientific",
    products: ["Watchman", "ICD", "CRT-D", "Ablation"],
    manufacturerAliases: ["Boston Sci", "BSX"],
  },
  {
    name: "Cook Medical",
    slug: "cook-medical",
    products: ["Extraction", "Other"],
    manufacturerAliases: ["Cook", "Cook Group"],
  },
  {
    name: "Edwards Lifesciences",
    slug: "edwards-lifesciences",
    products: ["Structural Heart"],
    manufacturerAliases: ["Edwards", "EW"],
  },
  {
    name: "Impulse Dynamics",
    slug: "impulse-dynamics",
    products: ["Other"],
    manufacturerAliases: ["Optimizer", "Impulse Dynamics NV"],
  },
  {
    name: "Johnson & Johnson MedTech",
    slug: "johnson-johnson-medtech",
    products: ["Ablation", "EP Study", "Structural Heart"],
    manufacturerAliases: ["J&J", "JNJ", "Biosense Webster", "Shockwave"],
  },
  {
    name: "Medtronic",
    slug: "medtronic",
    products: ["PPM", "ICD", "CRT-D", "CRT-P", "Loop", "Leadless PPM"],
    manufacturerAliases: ["Medtronic Inc", "MDT"],
    userVerificationMethod: "APPROVED_EMAIL_DOMAIN",
    approvedEmailDomains: ["medtronic.com"],
  },
  {
    name: "MicroPort CRM",
    slug: "microport-crm",
    products: ["PPM", "ICD", "CRT-D", "CRT-P"],
    manufacturerAliases: ["MicroPort", "LivaNova CRM", "Sorin"],
  },
  {
    name: "Philips",
    slug: "philips",
    products: ["EP Study", "Ablation", "Other"],
    manufacturerAliases: ["Philips Healthcare", "Koninklijke Philips"],
  },
  {
    name: "Terumo",
    slug: "terumo",
    products: ["Structural Heart", "Other"],
    manufacturerAliases: ["Terumo Corporation", "Terumo Interventional"],
  },
  {
    name: "Zoll Medical",
    slug: "zoll-medical",
    products: ["ICD", "Other"],
    manufacturerAliases: ["ZOLL", "Zoll", "Asahi Kasei Zoll"],
  },
];

function hoursFromNow(h: number) {
  return new Date(Date.now() + h * 60 * 60 * 1000);
}

function daysFromNow(d: number, hour = 10) {
  const date = new Date();
  date.setDate(date.getDate() + d);
  date.setHours(hour, 0, 0, 0);
  return date;
}

async function clearDemoData() {
  const demoUsers = await db.user.findMany({
    where: { email: { in: DEMO_EMAILS } },
    select: { id: true },
  });
  const ids = demoUsers.map((u) => u.id);
  if (ids.length === 0) return;

  await db.notification.deleteMany({ where: { userId: { in: ids } } });
  await db.favoriteRep.deleteMany({
    where: { OR: [{ providerId: { in: ids } }, { repId: { in: ids } }] },
  });

  const demoRequests = await db.serviceRequest.findMany({
    where: {
      OR: [{ providerId: { in: ids } }, { assignedRepId: { in: ids } }],
    },
    select: { id: true },
  });
  const requestIds = demoRequests.map((r) => r.id);

  if (requestIds.length > 0) {
    await db.requestStatusLog.deleteMany({ where: { requestId: { in: requestIds } } });
    await db.serviceRequest.deleteMany({ where: { id: { in: requestIds } } });
  }
}

async function logStatus(
  requestId: string,
  status: RequestStatus,
  note: string,
  offsetMinutes = 0
) {
  await db.requestStatusLog.create({
    data: {
      requestId,
      status,
      note,
      createdAt: new Date(Date.now() - offsetMinutes * 60 * 1000),
    },
  });
}

async function seedLegalDocuments() {
  for (const doc of LEGAL_DOCUMENTS) {
    await db.legalDocument.upsert({
      where: { slug: doc.slug },
      create: {
        slug: doc.slug,
        title: doc.title,
        version: doc.version,
        roleScopes: doc.roleScopes,
        summary: doc.summary,
        content: doc.content,
        active: true,
      },
      update: {
        title: doc.title,
        version: doc.version,
        roleScopes: doc.roleScopes,
        summary: doc.summary,
        content: doc.content,
        active: true,
      },
    });
  }
  console.log(`Seeded ${LEGAL_DOCUMENTS.length} legal documents`);
}

async function main() {
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 12);

  await seedLegalDocuments();
  const healthcareSites = await importHealthcareSitesFromJson(
    arizonaSites as HealthcareSiteInput[],
    {
    defaultStatus: "ACTIVE",
    }
  );
  console.log(`Seeded ${healthcareSites.length} healthcare sites`);
  await clearDemoData();

  // Demo users: VERIFIED account state (registered ≠ verified ≠ PHI-enabled org)
  const verifiedUserDefaults = {
    accountState: "VERIFIED" as const,
    verifiedAt: new Date("2025-01-01"),
  };

  const companiesBySlug = new Map<string, { id: string; name: string }>();
  for (const company of DEVICE_COMPANIES) {
    const extras = company.userVerificationMethod
      ? {
          userVerificationMethod: company.userVerificationMethod,
          approvedEmailDomains: company.approvedEmailDomains ?? [],
        }
      : {};
    const record = await db.company.upsert({
      where: { slug: company.slug },
      update: {
        name: company.name,
        products: company.products,
        manufacturerAliases: company.manufacturerAliases,
        active: true,
        ...extras,
      },
      create: {
        name: company.name,
        slug: company.slug,
        products: company.products,
        manufacturerAliases: company.manufacturerAliases,
        ...extras,
      },
    });
    companiesBySlug.set(company.slug, record);
  }

  const medtronic = companiesBySlug.get("medtronic")!;
  const boston = companiesBySlug.get("boston-scientific")!;
  console.log(`Seeded ${DEVICE_COMPANIES.length} device companies`);

  const valleyFacility =
    (await db.facility.findFirst({ where: { name: "Valley Heart Center" } })) ??
    (await db.facility.create({
      data: {
        name: "Valley Heart Center",
        address: "1200 Medical Blvd, Phoenix, AZ 85004",
        phone: "(602) 555-0100",
        lat: 33.4484,
        lng: -112.074,
        state: "AZ",
        county: "Maricopa",
        zipCode: "85004",
        companyId: medtronic.id,
      },
    }));

  const desertFacility =
    (await db.facility.findFirst({ where: { name: "Desert Regional Medical" } })) ??
    (await db.facility.create({
      data: {
        name: "Desert Regional Medical",
        address: "45000 Monterey Ave, Palm Desert, CA 92260",
        phone: "(760) 555-0200",
        lat: 33.7222,
        lng: -116.3745,
        state: "CA",
        county: "Riverside",
        zipCode: "92260",
        companyId: boston.id,
      },
    }));

  const valleyOrg = await db.providerOrganization.upsert({
    where: { slug: "valley-heart-system" },
    update: {
      status: "ACTIVATED",
      complianceMode: "PHI_ENABLED",
      verifiedAt: new Date("2025-01-01"),
      baaExecutedAt: new Date("2025-01-01"),
      orgAgreementAt: new Date("2025-01-01"),
      phiEnabledAt: new Date("2025-01-01"),
      userVerificationMethod: "APPROVED_EMAIL_DOMAIN",
      approvedEmailDomains: ["valleyheart.org"],
    },
    create: {
      name: "Valley Heart System",
      slug: "valley-heart-system",
      status: "ACTIVATED",
      complianceMode: "PHI_ENABLED",
      contactEmail: "privacy@valleyheart.org",
      verifiedAt: new Date("2025-01-01"),
      baaExecutedAt: new Date("2025-01-01"),
      orgAgreementAt: new Date("2025-01-01"),
      phiEnabledAt: new Date("2025-01-01"),
      userVerificationMethod: "APPROVED_EMAIL_DOMAIN",
      approvedEmailDomains: ["valleyheart.org"],
    },
  });

  const valleyOrgFacility =
    (await db.providerOrgFacility.findFirst({
      where: { organizationId: valleyOrg.id, name: "Valley Heart Center" },
    })) ??
    (await db.providerOrgFacility.create({
      data: {
        organizationId: valleyOrg.id,
        name: "Valley Heart Center",
        address: "1200 Medical Blvd, Phoenix, AZ 85004",
        zipCode: "85004",
        department: "EP Lab",
        phone: "(602) 555-0100",
      },
    }));

  await db.providerOrganization.upsert({
    where: { slug: "desert-regional-pending" },
    update: {
      status: "PENDING",
      complianceMode: "STANDARD",
      userVerificationMethod: "MANUAL_ADMIN_APPROVAL",
    },
    create: {
      name: "Desert Regional Medical",
      slug: "desert-regional-pending",
      status: "PENDING",
      complianceMode: "STANDARD",
      userVerificationMethod: "MANUAL_ADMIN_APPROVAL",
    },
  });

  const bannerOrg = await db.providerOrganization.upsert({
    where: { slug: "banner-health" },
    update: {
      status: "ACTIVATED",
      complianceMode: "PHI_ENABLED",
      verifiedAt: new Date("2025-06-01"),
      baaExecutedAt: new Date("2025-06-01"),
      orgAgreementAt: new Date("2025-06-01"),
      phiEnabledAt: new Date("2025-06-01"),
      userVerificationMethod: "EMAIL_DOMAIN_PLUS_ADMIN_APPROVAL",
      approvedEmailDomains: ["bannerhealth.com"],
    },
    create: {
      name: "Banner Health",
      slug: "banner-health",
      status: "ACTIVATED",
      complianceMode: "PHI_ENABLED",
      contactEmail: "privacy@bannerhealth.com",
      verifiedAt: new Date("2025-06-01"),
      baaExecutedAt: new Date("2025-06-01"),
      orgAgreementAt: new Date("2025-06-01"),
      phiEnabledAt: new Date("2025-06-01"),
      userVerificationMethod: "EMAIL_DOMAIN_PLUS_ADMIN_APPROVAL",
      approvedEmailDomains: ["bannerhealth.com"],
    },
  });

  const bannerFacility =
    (await db.providerOrgFacility.findFirst({
      where: {
        organizationId: bannerOrg.id,
        name: "Banner University Medical Center",
      },
    })) ??
    (await db.providerOrgFacility.create({
      data: {
        organizationId: bannerOrg.id,
        name: "Banner University Medical Center",
        address: "1111 E McDowell Rd, Phoenix, AZ 85006",
        zipCode: "85006",
        department: "Cardiology",
        phone: "(602) 555-0300",
      },
    }));

  const valleySite = healthcareSites.find((s) => s.name === "Valley Heart Center");
  const bannerSite = healthcareSites.find((s) =>
    s.name.includes("Banner - University Medical Center Phoenix")
  );

  if (valleySite) {
    await linkSiteToOrganization(valleyOrg.id, valleySite.id, true);
    await db.providerOrgFacility.updateMany({
      where: { organizationId: valleyOrg.id, name: "Valley Heart Center" },
      data: { siteId: valleySite.id },
    });
  }

  if (bannerSite) {
    await linkSiteToOrganization(bannerOrg.id, bannerSite.id, true);
    await db.providerOrgFacility.updateMany({
      where: {
        organizationId: bannerOrg.id,
        name: "Banner University Medical Center",
      },
      data: { siteId: bannerSite.id },
    });
  }

  const provider = await db.user.upsert({
    where: { email: "provider@demo.com" },
    update: {
      passwordHash,
      name: "Dr. Sarah Chen",
      phone: "(602) 555-0101",
      ...verifiedUserDefaults,
    },
    create: {
      email: "provider@demo.com",
      passwordHash,
      name: "Dr. Sarah Chen",
      phone: "(602) 555-0101",
      role: "PROVIDER",
      providerInfo: {
        create: {
          organizationId: valleyOrg.id,
          facilityId: valleyOrgFacility.id,
          accountStatus: "ACTIVE",
          onboardingComplete: true,
          onboardingStep: 4,
          workEmail: "provider@demo.com",
          workEmailVerified: true,
          termsAcceptedAt: new Date("2025-01-01"),
          userAgreementAt: new Date("2025-01-01"),
          facilityName: "Valley Heart Center",
          facilityAddress: "1200 Medical Blvd, Phoenix, AZ 85004",
          facilityPhone: "(602) 555-0100",
          facilityContactName: "Maria Lopez",
          facilityContactPhone: "(602) 555-0100",
          department: "EP Lab",
          defaultPhysician: "Dr. Sarah Chen",
          zipCode: "85004",
          requesterPhone: "(602) 555-0101",
          requesterFax: "(602) 555-0199",
        },
      },
    },
    include: { providerInfo: true },
  });

  if (!provider.providerInfo) {
    await db.providerProfile.create({
      data: {
        userId: provider.id,
        organizationId: valleyOrg.id,
        facilityId: valleyOrgFacility.id,
        accountStatus: "ACTIVE",
        onboardingComplete: true,
        onboardingStep: 4,
        workEmail: "provider@demo.com",
        workEmailVerified: true,
        termsAcceptedAt: new Date("2025-01-01"),
        userAgreementAt: new Date("2025-01-01"),
        facilityName: "Valley Heart Center",
        facilityAddress: "1200 Medical Blvd, Phoenix, AZ 85004",
        facilityPhone: "(602) 555-0100",
        facilityContactName: "Maria Lopez",
        facilityContactPhone: "(602) 555-0100",
        department: "EP Lab",
        defaultPhysician: "Dr. Sarah Chen",
        zipCode: "85004",
        requesterPhone: "(602) 555-0101",
        requesterFax: "(602) 555-0199",
      },
    });
  } else {
    await db.providerProfile.update({
      where: { userId: provider.id },
      data: {
        organizationId: valleyOrg.id,
        facilityId: valleyOrgFacility.id,
        accountStatus: "ACTIVE",
        onboardingComplete: true,
        onboardingStep: 4,
        workEmail: "provider@demo.com",
        workEmailVerified: true,
        termsAcceptedAt: new Date("2025-01-01"),
        userAgreementAt: new Date("2025-01-01"),
        zipCode: "85004",
      },
    });
  }

  const provider2 = await db.user.upsert({
    where: { email: "provider2@demo.com" },
    update: {
      passwordHash,
      name: "Dr. James Park",
      providerInfo: {
        upsert: {
          create: {
            accountStatus: "LIMITED",
            onboardingComplete: true,
            onboardingStep: 4,
            workEmail: "provider2@demo.com",
            termsAcceptedAt: new Date("2025-01-01"),
            userAgreementAt: new Date("2025-01-01"),
            facilityName: "Desert Regional Medical",
            facilityAddress: "45000 Monterey Ave, Palm Desert, CA 92260",
            department: "Cath Lab",
            defaultPhysician: "Dr. James Park",
          },
          update: {
            accountStatus: "LIMITED",
            onboardingComplete: true,
          },
        },
      },
    },
    create: {
      email: "provider2@demo.com",
      passwordHash,
      name: "Dr. James Park",
      phone: "(760) 555-0102",
      role: "PROVIDER",
      providerInfo: {
        create: {
          accountStatus: "LIMITED",
          onboardingComplete: true,
          onboardingStep: 4,
          workEmail: "provider2@demo.com",
          termsAcceptedAt: new Date("2025-01-01"),
          userAgreementAt: new Date("2025-01-01"),
          facilityName: "Desert Regional Medical",
          facilityAddress: "45000 Monterey Ave, Palm Desert, CA 92260",
          department: "Cath Lab",
          defaultPhysician: "Dr. James Park",
        },
      },
    },
  });

  async function upsertRep(
    email: string,
    name: string,
    phone: string,
    companyId: string,
    companyName: string,
    profile: {
      status: "AVAILABLE" | "BUSY" | "OFF_DUTY" | "VACATION";
      lat: number;
      lng: number;
      products: string[];
      credentialStatus: "ACTIVE" | "PENDING";
      onCallEnabled: boolean;
      territory: { state: string; county: string; zipCode: string };
    },
    reporting?: { managerId?: string; orgUnitId?: string }
  ) {
    const user = await db.user.upsert({
      where: { email },
      update: {
        passwordHash,
        name,
        phone,
        companyId,
        ...(reporting?.managerId ? { managerId: reporting.managerId } : {}),
        ...(reporting?.orgUnitId ? { orgUnitId: reporting.orgUnitId } : {}),
      },
      create: {
        email,
        passwordHash,
        name,
        phone,
        role: "REP",
        companyId,
        managerId: reporting?.managerId,
        orgUnitId: reporting?.orgUnitId,
      },
    });

    await db.repProfile.upsert({
      where: { userId: user.id },
      update: {
        status: profile.status,
        lat: profile.lat,
        lng: profile.lng,
        travelRadiusMiles: 75,
        credentialStatus: profile.credentialStatus,
        symplrMerged: profile.credentialStatus === "ACTIVE",
        products: profile.products,
        companies: [companyName],
        onCallEnabled: profile.onCallEnabled,
      },
      create: {
        userId: user.id,
        status: profile.status,
        lat: profile.lat,
        lng: profile.lng,
        travelRadiusMiles: 75,
        credentialStatus: profile.credentialStatus,
        symplrMerged: profile.credentialStatus === "ACTIVE",
        products: profile.products,
        companies: [companyName],
        onCallEnabled: profile.onCallEnabled,
      },
    });

    await db.territory.deleteMany({ where: { repProfileId: user.id } });
    await db.territory.create({
      data: {
        repProfileId: user.id,
        state: profile.territory.state,
        county: profile.territory.county,
        zipCode: profile.territory.zipCode,
      },
    });

    return user;
  }

  const repMike = await upsertRep(
    "rep@demo.com",
    "Mike Rodriguez",
    "(602) 555-0200",
    medtronic.id,
    "Medtronic",
    {
      status: "AVAILABLE",
      lat: 33.4152,
      lng: -111.8315,
      products: ["PPM", "ICD", "CRT-D"],
      credentialStatus: "ACTIVE",
      onCallEnabled: true,
      territory: { state: "AZ", county: "Maricopa", zipCode: "85004" },
    }
  );

  if (valleySite) {
    await db.repSiteCoverage.upsert({
      where: {
        repUserId_siteId: { repUserId: repMike.id, siteId: valleySite.id },
      },
      create: { repUserId: repMike.id, siteId: valleySite.id },
      update: {},
    });
  }
  if (bannerSite) {
    await db.repSiteCoverage.upsert({
      where: {
        repUserId_siteId: { repUserId: repMike.id, siteId: bannerSite.id },
      },
      create: { repUserId: repMike.id, siteId: bannerSite.id },
      update: {},
    });
  }

  const repLisa = await upsertRep(
    "rep2@demo.com",
    "Lisa Wong",
    "(602) 555-0201",
    medtronic.id,
    "Medtronic",
    {
      status: "BUSY",
      lat: 33.5092,
      lng: -111.989,
      products: ["Loop", "Leadless PPM", "CRT-P"],
      credentialStatus: "ACTIVE",
      onCallEnabled: false,
      territory: { state: "AZ", county: "Maricopa", zipCode: "85004" },
    }
  );

  const repTom = await upsertRep(
    "rep3@demo.com",
    "Tom Hayes",
    "(760) 555-0202",
    boston.id,
    "Boston Scientific",
    {
      status: "AVAILABLE",
      lat: 33.68,
      lng: -116.173,
      products: ["Watchman", "Ablation", "ICD"],
      credentialStatus: "ACTIVE",
      onCallEnabled: true,
      territory: { state: "CA", county: "Riverside", zipCode: "92260" },
    }
  );

  async function seedRepSchedule(repProfileId: string) {
    await db.repScheduleRule.deleteMany({ where: { repProfileId } });
    await db.repScheduleRule.createMany({
      data: [1, 2, 3, 4, 5].map((dayOfWeek) => ({
        repProfileId,
        dayOfWeek,
        startTime: "08:00",
        endTime: "17:00",
      })),
    });
  }

  await seedRepSchedule(repMike.id);
  await seedRepSchedule(repLisa.id);
  await seedRepSchedule(repTom.id);

  await db.user.upsert({
    where: { email: "admin@demo.com" },
    update: {
      passwordHash,
      companyId: medtronic.id,
      zipCodeStart: "85040",
      zipCodeEnd: "85050",
      ...verifiedUserDefaults,
      adminPermissions: [
        "MANAGE_REPS",
        "MANAGE_REQUESTS",
        "VIEW_CALENDAR",
        "MANAGE_TEAMS",
        "VIEW_TEAM_CALENDAR",
        "VIEW_METRICS",
        "MANAGE_ORG_UNITS",
        "MANAGE_TERRITORY",
      ],
    },
    create: {
      email: "admin@demo.com",
      passwordHash,
      name: "Medtronic Admin",
      role: "COMPANY_ADMIN",
      companyId: medtronic.id,
      zipCodeStart: "85040",
      zipCodeEnd: "85050",
      adminPermissions: [
        "MANAGE_REPS",
        "MANAGE_REQUESTS",
        "VIEW_CALENDAR",
        "MANAGE_TEAMS",
        "VIEW_TEAM_CALENDAR",
        "VIEW_METRICS",
        "MANAGE_ORG_UNITS",
        "MANAGE_TERRITORY",
      ],
    },
  });

  const medtronicAdmin = await db.user.findUnique({
    where: { email: "admin@demo.com" },
    select: { id: true },
  });

  const phoenixTeam =
    (await db.companyTeam.findFirst({
      where: { companyId: medtronic.id, name: "Phoenix Cardiac Team" },
    })) ??
    (await db.companyTeam.create({
      data: {
        companyId: medtronic.id,
        name: "Phoenix Cardiac Team",
        managerUserId: medtronicAdmin!.id,
        defaultCalendarVisibility: "SHARED_WITH_TEAM",
      },
    }));

  for (const repId of [repMike.id, repLisa.id]) {
    await db.companyTeamMember.upsert({
      where: { teamId_userId: { teamId: phoenixTeam.id, userId: repId } },
      create: { teamId: phoenixTeam.id, userId: repId },
      update: {},
    });
  }

  async function upsertOrgUnit(params: {
    companyId: string;
    name: string;
    typeLabel: string;
    parentId?: string | null;
  }) {
    const existing = await db.orgUnit.findFirst({
      where: {
        companyId: params.companyId,
        name: params.name,
        parentId: params.parentId ?? null,
      },
    });
    if (existing) {
      return db.orgUnit.update({
        where: { id: existing.id },
        data: { typeLabel: params.typeLabel },
      });
    }
    return db.orgUnit.create({
      data: {
        companyId: params.companyId,
        name: params.name,
        typeLabel: params.typeLabel,
        parentId: params.parentId ?? null,
      },
    });
  }

  const medtronicCompanyUnit = await upsertOrgUnit({
    companyId: medtronic.id,
    name: "Medtronic",
    typeLabel: "Company",
  });
  const westDivision = await upsertOrgUnit({
    companyId: medtronic.id,
    name: "West",
    typeLabel: "Division",
    parentId: medtronicCompanyUnit.id,
  });
  const southwestRegion = await upsertOrgUnit({
    companyId: medtronic.id,
    name: "Southwest",
    typeLabel: "Region",
    parentId: westDivision.id,
  });
  const phoenixArea = await upsertOrgUnit({
    companyId: medtronic.id,
    name: "Phoenix",
    typeLabel: "Area",
    parentId: southwestRegion.id,
  });
  const phoenixTerritory = await upsertOrgUnit({
    companyId: medtronic.id,
    name: "Phoenix Cardiac",
    typeLabel: "Territory",
    parentId: phoenixArea.id,
  });

  await db.companyTeam.update({
    where: { id: phoenixTeam.id },
    data: { orgUnitId: phoenixTerritory.id },
  });

  const regionalManager = await db.user.upsert({
    where: { email: "manager@demo.com" },
    update: {
      passwordHash,
      companyId: medtronic.id,
      managerId: medtronicAdmin!.id,
      orgUnitId: southwestRegion.id,
      ...verifiedUserDefaults,
      adminPermissions: [
        "VIEW_METRICS",
        "MANAGE_REQUESTS",
        "VIEW_CALENDAR",
        "VIEW_TEAM_CALENDAR",
        "MANAGE_REPS",
      ],
    },
    create: {
      email: "manager@demo.com",
      passwordHash,
      name: "Jordan Hale",
      role: "COMPANY_ADMIN",
      companyId: medtronic.id,
      managerId: medtronicAdmin!.id,
      orgUnitId: southwestRegion.id,
      adminPermissions: [
        "VIEW_METRICS",
        "MANAGE_REQUESTS",
        "VIEW_CALENDAR",
        "VIEW_TEAM_CALENDAR",
        "MANAGE_REPS",
      ],
    },
  });

  await db.orgUnitAssignment.upsert({
    where: {
      orgUnitId_userId: { orgUnitId: medtronicCompanyUnit.id, userId: medtronicAdmin!.id },
    },
    create: {
      orgUnitId: medtronicCompanyUnit.id,
      userId: medtronicAdmin!.id,
      permissions: [
        "VIEW_METRICS",
        "MANAGE_REQUESTS",
        "VIEW_CALENDAR",
        "VIEW_TEAM_CALENDAR",
        "MANAGE_REPS",
        "MANAGE_TEAMS",
        "MANAGE_ORG_UNITS",
        "MANAGE_TERRITORY",
      ],
    },
    update: {},
  });

  await db.orgUnitAssignment.upsert({
    where: {
      orgUnitId_userId: { orgUnitId: southwestRegion.id, userId: regionalManager.id },
    },
    create: {
      orgUnitId: southwestRegion.id,
      userId: regionalManager.id,
      permissions: [
        "VIEW_METRICS",
        "MANAGE_REQUESTS",
        "VIEW_CALENDAR",
        "VIEW_TEAM_CALENDAR",
        "MANAGE_REPS",
      ],
    },
    update: {},
  });

  await db.user.update({
    where: { id: medtronicAdmin!.id },
    data: { orgUnitId: medtronicCompanyUnit.id },
  });

  await db.user.update({
    where: { id: repMike.id },
    data: { managerId: regionalManager.id, orgUnitId: phoenixTerritory.id },
  });
  await db.user.update({
    where: { id: repLisa.id },
    data: { managerId: regionalManager.id, orgUnitId: phoenixTerritory.id },
  });

  await db.serviceRequest.updateMany({
    where: {
      companyId: medtronic.id,
      assignedRepId: { in: [repMike.id, repLisa.id] },
    },
    data: {
      teamId: phoenixTeam.id,
      teamCalendarVisibility: "SHARED_WITH_TEAM",
      calendarVisibilitySource: "TEAM_DEFAULT",
    },
  });

  await db.user.upsert({
    where: { email: "admin2@demo.com" },
    update: { passwordHash, companyId: boston.id, ...verifiedUserDefaults },
    create: {
      email: "admin2@demo.com",
      passwordHash,
      name: "Boston Admin",
      role: "COMPANY_ADMIN",
      companyId: boston.id,
    },
  });

  const bostonAdmin = await db.user.findUnique({
    where: { email: "admin2@demo.com" },
    select: { id: true },
  });
  const bostonCompanyUnit = await upsertOrgUnit({
    companyId: boston.id,
    name: "Boston Scientific",
    typeLabel: "Company",
  });
  if (bostonAdmin) {
    await db.user.update({
      where: { id: bostonAdmin.id },
      data: { orgUnitId: bostonCompanyUnit.id },
    });
    await db.orgUnitAssignment.upsert({
      where: {
        orgUnitId_userId: { orgUnitId: bostonCompanyUnit.id, userId: bostonAdmin.id },
      },
      create: {
        orgUnitId: bostonCompanyUnit.id,
        userId: bostonAdmin.id,
        permissions: [
          "VIEW_METRICS",
          "MANAGE_REQUESTS",
          "VIEW_CALENDAR",
          "VIEW_TEAM_CALENDAR",
          "MANAGE_REPS",
          "MANAGE_TEAMS",
          "MANAGE_ORG_UNITS",
        ],
      },
      update: {},
    });
    await db.user.update({
      where: { id: repTom.id },
      data: { managerId: bostonAdmin.id, orgUnitId: bostonCompanyUnit.id },
    });
  }

  await db.user.upsert({
    where: { email: "super@demo.com" },
    update: {
      passwordHash,
      ...verifiedUserDefaults,
      adminPermissions: [
        "SECURITY_KILL_SWITCH",
        "REVOKE_SESSIONS",
        "VIEW_AUDIT_LOGS",
      ],
    },
    create: {
      email: "super@demo.com",
      passwordHash,
      name: "Platform Admin",
      role: "SUPER_ADMIN",
    },
  });

  await db.favoriteRep.upsert({
    where: { providerId_repId: { providerId: provider.id, repId: repMike.id } },
    create: { providerId: provider.id, repId: repMike.id },
    update: {},
  });

  async function createRequest(
    data: {
      providerId: string;
      companyId: string;
      assignedAdminId?: string;
      assignedRepId?: string;
      facilityZipCode?: string;
      facilityName: string;
      facilityAddr: string;
      facilityLat?: number;
      facilityLng?: number;
      department: string;
      requesterName?: string;
      requesterPhone?: string;
      requesterEmail?: string;
      facilityContactName?: string;
      facilityContactPhone?: string;
      physicianName?: string;
      patientName: string;
      patientDOB: Date;
      patientRoom?: string;
      procedureType: string;
      product?: string;
      urgency: "ASAP" | "SAME_DAY" | "SCHEDULED";
      scheduledAt: Date;
      status: RequestStatus;
      notes?: string;
      etaMinutes?: number;
      repLat?: number;
      repLng?: number;
    },
    statusHistory: { status: RequestStatus; note: string; minutesAgo: number }[]
  ) {
    const req = await db.serviceRequest.create({
      data: {
        providerId: data.providerId,
        companyId: data.companyId,
        assignedAdminId: data.assignedAdminId,
        assignedRepId: data.assignedRepId,
        facilityZipCode: data.facilityZipCode,
        facilityName: data.facilityName,
        facilityAddr: data.facilityAddr,
        facilityPhone: "(602) 555-0100",
        facilityContactName: data.facilityContactName ?? "Maria Lopez",
        facilityContactPhone: data.facilityContactPhone ?? "(602) 555-0100",
        facilityLat: data.facilityLat,
        facilityLng: data.facilityLng,
        department: data.department,
        requesterName: data.requesterName ?? "Dr. Sarah Chen",
        requesterPhone: data.requesterPhone ?? "(602) 555-0101",
        requesterEmail: data.requesterEmail ?? "provider@demo.com",
        physicianName: data.physicianName,
        patientNameEnc: encryptPHI(data.patientName),
        patientDOBEnc: encryptDate(data.patientDOB),
        patientRoomEnc: data.patientRoom ? encryptPHI(data.patientRoom) : encryptPHI("412A"),
        procedureType: data.procedureType,
        product: data.product,
        urgency: data.urgency,
        scheduledAt: data.scheduledAt,
        status: data.status,
        notes: data.notes,
        etaMinutes: data.etaMinutes,
        repLat: data.repLat,
        repLng: data.repLng,
      },
    });

    for (const entry of statusHistory) {
      await logStatus(req.id, entry.status, entry.note, entry.minutesAgo);
    }

    return req;
  }

  // 1. Emergency — assigned, waiting for rep to accept
  const emergency = await createRequest(
    {
      providerId: provider.id,
      companyId: medtronic.id,
      assignedAdminId: medtronicAdmin?.id,
      assignedRepId: repMike.id,
      facilityZipCode: "85044",
      facilityName: valleyFacility.name,
      facilityAddr: valleyFacility.address,
      facilityLat: valleyFacility.lat ?? undefined,
      facilityLng: valleyFacility.lng ?? undefined,
      department: "EP Lab",
      physicianName: "Dr. Sarah Chen",
      patientName: "Robert Martinez",
      patientDOB: new Date("1958-03-12"),
      procedureType: "ICD",
      product: "ICD",
      urgency: "ASAP",
      scheduledAt: hoursFromNow(1),
      status: "ACCEPTED",
      notes: "STAT — device advisory case, need rep ASAP",
    },
    [
      { status: "REQUESTING", note: "Request submitted", minutesAgo: 8 },
      { status: "ACCEPTED", note: `Accepted and assigned to ${repMike.name}`, minutesAgo: 6 },
    ]
  );

  // 2. Same day — accepted, rep should mark en route
  const sameDay = await createRequest(
    {
      providerId: provider.id,
      companyId: medtronic.id,
      assignedAdminId: medtronicAdmin?.id,
      assignedRepId: repMike.id,
      facilityZipCode: "85044",
      facilityName: valleyFacility.name,
      facilityAddr: valleyFacility.address,
      facilityLat: valleyFacility.lat ?? undefined,
      facilityLng: valleyFacility.lng ?? undefined,
      department: "EP Lab",
      physicianName: "Dr. Sarah Chen",
      patientName: "Patricia Nguyen",
      patientDOB: new Date("1972-07-22"),
      procedureType: "PPM",
      product: "PPM",
      urgency: "SAME_DAY",
      scheduledAt: hoursFromNow(4),
      status: "ACCEPTED",
      notes: "Dual-chamber PPM upgrade",
    },
    [
      { status: "REQUESTING", note: "Request submitted", minutesAgo: 45 },
      { status: "ACCEPTED", note: `Assigned to ${repMike.name}`, minutesAgo: 35 },
    ]
  );

  // 3. En route
  const enRoute = await createRequest(
    {
      providerId: provider.id,
      companyId: medtronic.id,
      assignedAdminId: medtronicAdmin?.id,
      assignedRepId: repMike.id,
      facilityZipCode: "85044",
      facilityName: valleyFacility.name,
      facilityAddr: valleyFacility.address,
      facilityLat: valleyFacility.lat ?? undefined,
      facilityLng: valleyFacility.lng ?? undefined,
      department: "Cath Lab",
      physicianName: "Dr. Sarah Chen",
      patientName: "William Foster",
      patientDOB: new Date("1965-11-08"),
      procedureType: "CRT-D",
      product: "CRT-D",
      urgency: "SCHEDULED",
      scheduledAt: hoursFromNow(2),
      status: "EN_ROUTE",
      etaMinutes: 18,
      repLat: 33.43,
      repLng: -111.95,
      notes: "CRT-D implant, bring backup leads",
    },
    [
      { status: "REQUESTING", note: "Request submitted", minutesAgo: 120 },
      { status: "ACCEPTED", note: `Assigned to ${repMike.name}`, minutesAgo: 110 },
      { status: "EN_ROUTE", note: "Rep en route", minutesAgo: 20 },
    ]
  );

  // 4. Arrived — rep should complete case
  const arrived = await createRequest(
    {
      providerId: provider.id,
      companyId: medtronic.id,
      assignedAdminId: medtronicAdmin?.id,
      assignedRepId: repMike.id,
      facilityZipCode: "85044",
      facilityName: valleyFacility.name,
      facilityAddr: valleyFacility.address,
      facilityLat: valleyFacility.lat ?? undefined,
      facilityLng: valleyFacility.lng ?? undefined,
      department: "EP Lab",
      physicianName: "Dr. Sarah Chen",
      patientName: "Susan Miller",
      patientDOB: new Date("1949-01-30"),
      procedureType: "Loop",
      product: "Loop",
      urgency: "SCHEDULED",
      scheduledAt: hoursFromNow(0.5),
      status: "ARRIVED",
      notes: "Loop recorder implant",
    },
    [
      { status: "REQUESTING", note: "Request submitted", minutesAgo: 180 },
      { status: "ACCEPTED", note: `Assigned to ${repMike.name}`, minutesAgo: 170 },
      { status: "EN_ROUTE", note: "Rep en route", minutesAgo: 60 },
      { status: "ARRIVED", note: "Rep arrived on site", minutesAgo: 10 },
    ]
  );

  // 5. Completed — shows in history
  await createRequest(
    {
      providerId: provider.id,
      companyId: medtronic.id,
      assignedAdminId: medtronicAdmin?.id,
      assignedRepId: repMike.id,
      facilityZipCode: "85044",
      facilityName: valleyFacility.name,
      facilityAddr: valleyFacility.address,
      department: "EP Lab",
      physicianName: "Dr. Sarah Chen",
      patientName: "James Wilson",
      patientDOB: new Date("1955-09-14"),
      procedureType: "ICD",
      product: "ICD",
      urgency: "SCHEDULED",
      scheduledAt: daysFromNow(-2, 14),
      status: "COMPLETED",
      notes: "Successful ICD generator change",
    },
    [
      { status: "REQUESTING", note: "Request submitted", minutesAgo: 3000 },
      { status: "ACCEPTED", note: `Assigned to ${repMike.name}`, minutesAgo: 2970 },
      { status: "EN_ROUTE", note: "Rep en route", minutesAgo: 2900 },
      { status: "ARRIVED", note: "Rep arrived", minutesAgo: 2880 },
      { status: "COMPLETED", note: "Case completed", minutesAgo: 2700 },
    ]
  );

  // 6. Cancelled
  await createRequest(
    {
      providerId: provider.id,
      companyId: medtronic.id,
      assignedAdminId: medtronicAdmin?.id,
      assignedRepId: repMike.id,
      facilityZipCode: "85044",
      facilityName: valleyFacility.name,
      facilityAddr: valleyFacility.address,
      department: "EP Lab",
      physicianName: "Dr. Sarah Chen",
      patientName: "Maria Garcia",
      patientDOB: new Date("1968-04-05"),
      procedureType: "Extraction",
      urgency: "SCHEDULED",
      scheduledAt: daysFromNow(3, 9),
      status: "CANCELLED",
      notes: "Case cancelled — patient rescheduled",
    },
    [
      { status: "REQUESTING", note: "Request submitted", minutesAgo: 500 },
      { status: "CANCELLED", note: "Cancelled by provider", minutesAgo: 480 },
    ]
  );

  // 7. Boston Scientific — assigned to Tom (for provider2 / different company test)
  await createRequest(
    {
      providerId: provider2.id,
      companyId: boston.id,
      assignedRepId: repTom.id,
      facilityName: desertFacility.name,
      facilityAddr: desertFacility.address,
      facilityLat: desertFacility.lat ?? undefined,
      facilityLng: desertFacility.lng ?? undefined,
      department: "Cath Lab",
      physicianName: "Dr. James Park",
      patientName: "David Chen",
      patientDOB: new Date("1960-12-01"),
      procedureType: "Watchman",
      product: "Watchman",
      urgency: "SCHEDULED",
      scheduledAt: daysFromNow(1, 11),
      status: "REQUESTING",
      notes: "Watchman LAA closure",
    },
    [
      { status: "REQUESTING", note: "Request submitted", minutesAgo: 30 },
    ]
  );

  // Notifications
  await db.notification.createMany({
    data: [
      {
        userId: repMike.id,
        title: "New Rep Request",
        body: `ASAP ICD request at ${valleyFacility.name}`,
        type: "REQUEST_ASSIGNED",
        data: { requestId: emergency.id },
        read: false,
      },
      {
        userId: repMike.id,
        title: "Request Accepted",
        body: "Same-day PPM case confirmed",
        type: "REQUEST_STATUS",
        data: { requestId: sameDay.id },
        read: true,
      },
      {
        userId: provider.id,
        title: "Rep En Route",
        body: `${repMike.name} is en route — ETA 18 min`,
        type: "REQUEST_STATUS",
        data: { requestId: enRoute.id },
        read: false,
      },
      {
        userId: provider.id,
        title: "Rep Arrived",
        body: `${repMike.name} arrived for Loop case`,
        type: "REQUEST_STATUS",
        data: { requestId: arrived.id },
        read: false,
      },
    ],
  });

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                   GoRepYo Demo Test Data Ready                   ║
╚══════════════════════════════════════════════════════════════════╝

Run:  nvm use && npm run dev
Seed: npm run db:seed   (re-run anytime to reset demo data)

All demo passwords: ${DEMO_PASSWORD}

ACCOUNTS
──────────────────────────────────────────────────────────────────
  Provider (main)     provider@demo.com     → /provider
  Provider (alt)      provider2@demo.com    → /provider
  Rep (Medtronic)     rep@demo.com          → /rep   Mike Rodriguez, AVAILABLE
  Rep (Medtronic)     rep2@demo.com         → /rep   Lisa Wong, BUSY
  Rep (Boston Sci)    rep3@demo.com         → /rep   Tom Hayes, AVAILABLE
  Company admin       admin@demo.com        → /company   (Medtronic, company-wide)
  Regional admin      manager@demo.com      → /company   (Southwest region)
  Company admin       admin2@demo.com       → /company   (Boston Scientific)
  Platform admin      super@demo.com        → /admin

SEEDED CASES (sign in as provider@demo.com)
──────────────────────────────────────────────────────────────────
  1. ASAP / ICD           → ACCEPTED    Mark En Route as rep@demo.com
  2. SAME DAY / PPM       → ACCEPTED    Mark En Route as rep
  3. SCHEDULED / CRT-D    → EN ROUTE    Track ETA on provider dashboard
  4. SCHEDULED / Loop     → ARRIVED     Complete Request as rep
  5. SCHEDULED / ICD      → COMPLETED   View in Requests → Completed tab
  6. SCHEDULED / Extract  → CANCELLED   View in Requests → Cancelled tab

  provider2@demo.com has 1 Watchman case (Boston Sci) assigned to rep3@demo.com

TEST WALKTHROUGH
──────────────────────────────────────────────────────────────────
  A. Provider (provider@demo.com)
     • Dashboard → see 4 active cases + status pipeline
     • Request a Rep → submit new case (pick Medtronic for auto-assign)
     • Requests → filter All / Active / Completed / Cancelled
     • Favorites → Mike Rodriguez is favorited → Quick Request

  B. Rep (rep@demo.com)
     • Dashboard → toggle Available / On Call
     • Accept the ASAP request → Mark En Route → Arrived → Complete
     • Schedule → see today's grouped cases
     • Territory → edit coverage & products → Save

  C. Company (admin@demo.com)
     • Overview → rep & case stats
     • Reps → change Lisa Wong credential status
     • Analytics → procedure breakdown & response times

  D. Platform (super@demo.com)
     • Tenants → add/toggle companies
     • Users → change roles

  E. End-to-end live flow
     1. provider@demo.com → Request a Rep (Medtronic, PPM, Same Day)
     2. rep@demo.com → Accept → En Route → Arrived → Complete
     3. provider@demo.com → watch status update in real time
`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
