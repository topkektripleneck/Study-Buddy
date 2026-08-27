export interface BreakSuggestion {
  label: string;
  detail: string;
}

interface BreakTier {
  maxMinutes: number;
  headline: string;
  suggestions: BreakSuggestion[];
}

const TIERS: BreakTier[] = [
  {
    maxMinutes: 5,
    headline: "Quick reset",
    suggestions: [
      { label: "Light stretching", detail: "Neck rolls, shoulder shrugs, wrist circles" },
      { label: "20-20-20 rule", detail: "Look 20 ft away for 20 seconds to rest your eyes" },
      { label: "Refill water", detail: "Stand up, hydrate, sit back down" },
      { label: "Box breathing", detail: "4 in, 4 hold, 4 out, 4 hold — twice through" },
    ],
  },
  {
    maxMinutes: 10,
    headline: "Short break",
    suggestions: [
      { label: "Walk around", detail: "Loop the room or hallway to reset posture" },
      { label: "4-7-8 breathing", detail: "Calms the nervous system after deep focus" },
      { label: "Tidy your desk", detail: "Clear the surface before the next block" },
      { label: "Snack + water", detail: "Something light — avoid a sugar crash" },
    ],
  },
  {
    maxMinutes: 20,
    headline: "Medium break",
    suggestions: [
      { label: "Take a walk", detail: "Step outside for daylight if you can" },
      { label: "Full-body mobility", detail: "Hips, hamstrings, thoracic spine" },
      { label: "Real snack", detail: "Protein or fruit beats another coffee" },
      { label: "Message someone", detail: "A short social reset, then back to it" },
    ],
  },
  {
    maxMinutes: Number.POSITIVE_INFINITY,
    headline: "Long break",
    suggestions: [
      { label: "Proper walk outside", detail: "15+ minutes of movement and daylight" },
      { label: "Eat a meal", detail: "Away from your desk and screens" },
      { label: "Power nap", detail: "20 minutes max, set an alarm" },
      { label: "Shower or wash up", detail: "Strong reset between long work blocks" },
    ],
  },
];

export function breakPlanFor(minutes: number): {
  headline: string;
  suggestions: BreakSuggestion[];
} {
  const tier = TIERS.find((t) => minutes <= t.maxMinutes) ?? TIERS[TIERS.length - 1];
  return { headline: tier.headline, suggestions: tier.suggestions };
}
