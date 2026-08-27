export interface SideQuest {
  title: string;
  detail: string;
  hp: string;
}

export const SIDE_QUESTS: SideQuest[] = [
  { title: "Walk Quest", detail: "5-minute walk outside", hp: "+1 HP" },
  { title: "Hydration Quest", detail: "Drink a full glass of water", hp: "+1 HP" },
  { title: "Stretch Quest", detail: "Light neck and shoulder rolls", hp: "+1 HP" },
  { title: "Window Quest", detail: "Look at something 20 ft away for 20 seconds", hp: "+1 HP" },
  { title: "Music Quest", detail: "One song that lifts your mood", hp: "+2 HP" },
];

export function pickSideQuest(seed: number): SideQuest {
  return SIDE_QUESTS[Math.abs(seed) % SIDE_QUESTS.length];
}
