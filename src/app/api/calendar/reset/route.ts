import { json, staffRoute } from "@/lib/api";
import { calendarLinks, staffCalendarToken } from "@/lib/services/calendar";

/** Issues a new private calendar link for the signed-in staff member; the old one stops working. */
export const POST = staffRoute(async (_req, user) => {
  const token = await staffCalendarToken(user, true);
  return json({ links: calendarLinks(token, "The Engineers Club payments") });
});
