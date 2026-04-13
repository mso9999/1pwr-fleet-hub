"use client";

import { useLocaleContext } from "@/i18n/locale-context";
import { TUTORIAL_TRACK_ORDER, TUTORIAL_TRACKS } from "@/lib/tutorial-steps";
import { useTutorial } from "./tutorial-context";

export function TutorialLaunchButton({ className }: { className?: string }): React.ReactElement {
  const { active, start } = useTutorial();
  const { t } = useLocaleContext();
  if (active) return <></>;

  const baseClass =
    className ||
    "inline-flex items-center gap-2 text-xs font-medium text-blue-600 hover:text-blue-800";

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
        {TUTORIAL_TRACK_ORDER.map((id) => (
          <option key={id} value={id}>
            {TUTORIAL_TRACKS[id]?.label ?? id}
          </option>
        ))}
      </select>
    </label>
  );
}
