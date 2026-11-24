import { redirect } from "next/navigation";

/** Projects were removed; locations live on the calendar. */
export default function ProjectsPage() {
  redirect("/");
}
