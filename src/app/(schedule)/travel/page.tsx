import { redirect } from "next/navigation";

/** Travel is scheduled on the Month calendar — no separate Travel page. */
export default function TravelPage() {
  redirect("/month");
}
