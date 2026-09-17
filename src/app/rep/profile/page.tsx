import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { MyProfilePage } from "@/components/profile/my-profile-page";

export default async function Page() {
  const session = await auth();
  if (!session?.user || session.user.role !== "REP") redirect("/login");
  return <MyProfilePage portal="rep" userName={session.user.name} />;
}
