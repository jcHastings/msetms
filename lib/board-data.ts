import { suggestAssignmentsForBoard } from "./assign-suggestions";
import { listExceptionInbox } from "./exceptions";
import { readStoredSamsaraFleet } from "./integrations/samsara";
import { laneAveragesForBoard } from "./lane-average";
import { listLoads } from "./queries";

/** Active-board numbers the dispatch page builds, from stored rows only. */
export function buildBoardWorkingData(now = new Date()) {
  const loads = listLoads({ status: "active" });
  const inbox = listExceptionInbox(now);
  const lanes = laneAveragesForBoard(loads);
  const fleet = readStoredSamsaraFleet();
  const suggestions = suggestAssignmentsForBoard({ loads, fleet, now });
  return { loads, inbox, lanes, fleet, suggestions };
}
