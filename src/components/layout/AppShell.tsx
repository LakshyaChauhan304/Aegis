import React from "react";
import Sidebar from "./Sidebar.tsx";
import TopNav from "./TopNav.tsx";
import Transport from "../recorder/Transport.tsx";
import { RAILED_ROUTES, TRANSPORT_ROUTES } from "./routes.ts";
import RailEvidence from "../evidence/RailEvidence.tsx";

export default function AppShell({
  route, setRoute, events, playIdx, setPlayIdx, selectedEvent, selectEvent, activeRun, children
}: any) {
  const hasRail = RAILED_ROUTES.has(route);
  const hasTransport = TRANSPORT_ROUTES.has(route);

  return (
    <div className="app">
      <Sidebar route={route} setRoute={setRoute} />

      <main className="main">
        <TopNav activeRun={activeRun} />
        
        <div className={"workspace" + (hasRail ? " railed" : "")}>
          <div className="content">
            {children}
          </div>
          
          {hasRail ? (
            <aside className="rail">
              <RailEvidence
                events={events}
                idx={playIdx}
                selected={selectedEvent}
                select={selectEvent}
              />
            </aside>
          ) : null}
        </div>

        {hasTransport ? (
          <div className="transport">
            <Transport
              events={events}
              idx={playIdx}
              setIdx={setPlayIdx}
              selected={selectedEvent}
              select={selectEvent}
            />
          </div>
        ) : null}
      </main>
    </div>
  );
}
