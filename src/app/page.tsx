"use client";

import { useApp } from "@/stores/app-store";
import { Sidebar } from "@/components/cinestream/Sidebar";
import { Navbar } from "@/components/cinestream/Navbar";
import { Footer } from "@/components/cinestream/Footer";
import { HomePage } from "@/components/cinestream/HomePage";
import { BrowsePage } from "@/components/cinestream/BrowsePage";
import { SearchPage } from "@/components/cinestream/SearchPage";
import { DetailPage } from "@/components/cinestream/DetailPage";
import { WatchPartyFab } from "@/components/cinestream/WatchPartyFab";
import { PartySyncBridge } from "@/components/cinestream/PartySyncBridge";

export default function Home() {
  const view = useApp((s) => s.view);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Persistent desktop sidebar (lg+ only; mobile uses hamburger drawer) */}
      <Sidebar />
      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="flex-1">
          {view.kind === "home" && <HomePage />}
          {view.kind === "browse" && (
            <BrowsePage
              subjectType={view.subjectType}
              genre={view.genre}
              title={view.title}
            />
          )}
          {view.kind === "search" && <SearchPage keyword={view.keyword} />}
          {view.kind === "detail" && (
            <DetailPage
              subjectId={view.subjectId}
              subjectType={view.subjectType}
            />
          )}
        </main>
        <Footer />
      </div>

      {/* Watch-party floating button + popup */}
      <WatchPartyFab />
      {/* Bridges party state <-> navigation/video (no UI) */}
      <PartySyncBridge />
    </div>
  );
}
