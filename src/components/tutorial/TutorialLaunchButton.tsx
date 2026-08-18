"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { bearerAuthHeaders } from "@/lib/client-bearer";
import { useLocaleContext } from "@/i18n/locale-context";
import { TUTORIAL_TRACK_ORDER, getTutorialTrackLabel } from "@/lib/tutorial-steps";
import { useTutorial } from "./tutorial-context";

export function TutorialLaunchButton({ className }: { className?: string }): React.ReactElement {
  const { active, start } = useTutorial();
  const { locale, t } = useLocaleContext();
  const { organizationId } = useAuth();
  const [canApproveMissions, setCanApproveMissions] = useState(false);

  // Role-awareness: approvers get the mission-approval track pinned to the top
  // of the menu. Best-effort — if the check fails, the menu stays in default order.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const headers = await bearerAuthHeaders();
        const res = await fetch(
          `/api/me/mission-request-can-approve?org=${encodeURIComponent(organizationId || "1pwr_lesotho")}`,
          { headers }
        );
        if (!res.ok) return;
        const j = (await res.json()) as { canApprove?: boolean };
        if (!cancelled) setCanApproveMissions(j.canApprove === true);
      } catch {
        /* menu stays in default order */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [organizationId]);

  if (active) return <></>;

  const baseClass =
    className ||
    "inline-flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-800";

  const orderedTracks = canApproveMissions
    ? ["missionApproval", ...TUTORIAL_TRACK_ORDER.filter((id) => id !== "missionApproval")]
    : TUTORIAL_TRACK_ORDER;

  return (
    <label className={baseClass}>
      <span className="hover:underline cursor-default">{t("tutorial.mode")}</span>
      <select
        className="max-w-[200px] rounded border border-zinc-200 bg-white py-1 pl-2 pr-6 text-xs text-zinc-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        aria-label={t("tutorial.mode")}
        defaultValue=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) start(v);
          e.target.value = "";
        }}
      >
        <option value="" disabled>
          {t("tutorial.chooseTrack")}
        </option>
        {orderedTracks.map((id) => (
          <option key={id} value={id}>
            {getTutorialTrackLabel(id, locale)}
            {id === "missionApproval" && canApproveMissions
              ? locale === "fr"
                ? " — recommande pour vous"
                : " — recommended for you"
              : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
