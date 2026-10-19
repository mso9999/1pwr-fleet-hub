"use client";

import { Button } from "@/components/ui/button";

export function PendingMissionApprovalActions({
  missionId,
  missionLabel,
  disabled,
  onApprove,
  onRevise,
  onReject,
  className,
}: {
  missionId: string;
  missionLabel: string;
  disabled?: boolean;
  onApprove: (missionId: string) => void | Promise<void>;
  onRevise: (missionId: string) => void | Promise<void>;
  onReject: (missionId: string) => void | Promise<void>;
  className?: string;
}): React.ReactElement {
  const short = missionLabel.trim().slice(0, 80) || missionId;

  return (
    <div
      className={className}
      data-testid={`pending-mission-actions-${missionId}`}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <Button
        type="button"
        size="sm"
        disabled={disabled}
        className="bg-emerald-600 hover:bg-emerald-700 text-white touch-manipulation"
        onClick={() => {
          if (
            !window.confirm(
              `Approve mission “${short}”?\n\nThis records your approval in the audit log and lets fleet reserve a vehicle.`
            )
          ) {
            return;
          }
          void onApprove(missionId);
        }}
      >
        Approve
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        className="text-amber-800 border-amber-300 touch-manipulation"
        onClick={() => void onRevise(missionId)}
      >
        Revise &amp; resubmit
      </Button>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        className="text-red-700 border-red-200 touch-manipulation"
        onClick={() => void onReject(missionId)}
      >
        Reject
      </Button>
    </div>
  );
}
