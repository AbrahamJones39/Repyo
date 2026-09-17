import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MyProfilePage } from "@/components/profile/my-profile-page";

export default async function Page() {
  const session = await auth();
  if (!session?.user || session.user.role !== "PROVIDER") redirect("/login");
  return <MyProfilePage portal="provider" userName={session.user.name} />;
}
