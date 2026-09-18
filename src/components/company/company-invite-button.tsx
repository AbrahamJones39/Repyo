"use client";

import { useState } from "react";
import { UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InviteModal } from "@/components/invitations/invite-modal";

const COMPANY_INVITE_ROLES = [
  { value: "REP" as const, label: "Rep" },
  { value: "COMPANY_ADMIN" as const, label: "Device Team Administrator/Manager" },
];

export function CompanyInviteButton({
  variant = "outline",
}: {
  variant?: "primary" | "outline";
}) {
  const [showInviteModal, setShowInviteModal] = useState(false);

  return (
    <>
      <Button variant={variant} onClick={() => setShowInviteModal(true)}>
        <UserPlus className="h-4 w-4" />
        Invite
      </Button>
      {showInviteModal && (
        <InviteModal
          onClose={() => setShowInviteModal(false)}
          targetRoleOptions={COMPANY_INVITE_ROLES}
        />
      )}
    </>
  );
}
