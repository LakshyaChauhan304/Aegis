import React from "react";
import Chip from "./Chip.tsx";
import { stateLabel } from "../../data/status.ts";

const MAP: any = {
  VERIFIED: ["allow", "\u2713"],
  LIVE_VERIFIED: ["allow", "\u2713"],
  CONNECTED: ["info", "\u25cf"],
  SDK_READY: ["info", "\u25e7"],
  IMPLEMENTED: ["ghost", "\u25e7"],
  NOT_CONFIGURED: ["ghost", "\u25cb"],
  UNAVAILABLE: ["ghost", "\u25cb"],
  FIXTURE: ["ghost", "\u25cc"],
  PARTIAL: ["warn", "\u25d2"],
  LOCAL: ["info", "\u25cf"],
  LIVE: ["allow", "\u2713"],
  DEGRADED: ["warn", "\u25d2"],
  TARGET: ["ghost", "\u25cb"],
  "NOT VERIFIED": ["ghost", "\u25cc"],
};

export default function StateChip({ s }: any) {
  const [kind, icon] = MAP[s] || ["ghost", "\u25cb"];
  return <Chip kind={kind} icon={icon}>{stateLabel(String(s))}</Chip>;
}
