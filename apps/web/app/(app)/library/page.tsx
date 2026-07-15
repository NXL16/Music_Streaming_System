"use client";

import { useState } from "react";
import { AppButtonLink } from "@/components/layout/app-button-link";
import { PageHero } from "@/components/layout/page-hero";
import { SongLibraryPanel } from "@/components/songs/song-library-panel";
import { SongUploadPanel } from "@/components/songs/song-upload-panel";

export default function LibraryPage() {
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);
  const [uploadOpen, setUploadOpen] = useState(false);

  function handleUploaded() {
    setLibraryRefreshKey((current) => current + 1);
    setUploadOpen(false);
  }

  return (
    <>
      <PageHero
        eyebrow="Library"
        title="Songs"
        description="Browse your uploaded music, follow processing status, and keep your personal library organized."
        actions={
          <>
            <button
              type="button"
              onClick={() => setUploadOpen(true)}
              className="rounded-full bg-[#fa233b] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#d91d32]"
            >
              Upload
            </button>
            <AppButtonLink href="/profile">Profile</AppButtonLink>
          </>
        }
      />

      <div className="mt-6">
        <SongLibraryPanel
          refreshKey={libraryRefreshKey}
          onUploadClick={() => setUploadOpen(true)}
        />
      </div>

      {uploadOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/28 px-4 py-8 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-4 shadow-[0_28px_90px_rgba(0,0,0,0.22)] ring-1 ring-[#e5e5ea] md:p-6">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#fa233b]">
                  Upload
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-[-0.04em] text-[#1d1d1f]">
                  Add a song
                </h2>
              </div>

              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-full bg-[#f2f2f7] px-4 py-2 text-sm font-bold text-[#1d1d1f] transition hover:bg-[#e5e5ea]"
              >
                Close
              </button>
            </div>

            <SongUploadPanel onUploaded={handleUploaded} compact />
          </div>
        </div>
      )}
    </>
  );
}
