import { slugProject, type CrewProject } from "@/lib/crew-roster";

/** Active Tower Arctic jobs for Food / crew ops — year 2026. */
export const TOWER_ACTIVE_PROJECTS: { name: string; region: string }[] = [
  { name: "1430 - Iqaluit", region: "Iqaluit" },
  { name: "Quarry", region: "Iqaluit" },
  { name: "Trigram", region: "Iqaluit" },
  { name: "46 Plex", region: "Iqaluit" },
  { name: "Siteworks", region: "Iqaluit" },
  { name: "Valve Replacement", region: "Iqaluit" },
  { name: "AV328 Prov. AV93-96", region: "Iqaluit" },
  { name: "Nikku Lane", region: "Iqaluit" },
  { name: "Noble House", region: "Iqaluit" },
  { name: "Critical Pipeline Project", region: "Iqaluit" },
  { name: "Steam Building", region: "Iqaluit" },
  { name: "Hospital Hill (BDL)", region: "Iqaluit" },
  { name: "Kugluktuk Airside Rehab", region: "Kugluktuk" },
  { name: "Pond Inlet Airside Rehab", region: "Pond Inlet" },
  { name: "WTP Project", region: "Pond Inlet" },
  { name: "Daycare", region: "Pond Inlet" },
  { name: "IDP Project (Pond)", region: "Pond Inlet" },
  { name: "NCCD deficiencies", region: "Pond Inlet" },
];

export function catalogProjects(year: number): CrewProject[] {
  return TOWER_ACTIVE_PROJECTS.map((project) => ({
    id: slugProject(project.name),
    name: project.name,
    year,
    source: `tower-${project.region.toLowerCase().replace(/\s+/g, "-")}`,
  }));
}
