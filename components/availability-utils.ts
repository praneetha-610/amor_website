import type { AvailabilityPayload, DayAvailability } from "@/lib/inventory";

/** The first date a customer can actually reserve right now (skips a closed "today"). */
export function firstBookableDay(data: AvailabilityPayload): DayAvailability | undefined {
  return data.days.find((d) => d.bookable);
}
