"use client";

import { useEffect, useState } from "react";

type Denial = {
  action: string;
  assignedRoles: string[];
  requiredRoles: string[];
  owners?: Array<{ owner?: string; manages?: string }>;
  resolution?: string;
};

interface Props {
  user: { role?: string; department?: string; organizationId?: string } | null;
}

export default function PrivilegeDenialOverlay({ user }: Props): React.ReactElement | null {
  const [denial, setDenial] = useState<Denial | null>(null);

  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = async (...args: Parameters<typeof fetch>): Promise<Response> => {
      const response = await original(...args);
      if (response.status === 403) {
        const body = await response.clone().json().catch(() => ({})) as Record<string, unknown>;
        const detail = body.detail && typeof body.detail === "object"
          ? body.detail as Record<string, unknown>
          : body;
        const rawRequired = detail.required_roles;
        const requiredRoles = Array.isArray(rawRequired)
          ? rawRequired.map(String)
          : [String(detail.error || detail.message || "A Fleet Lead, Manager, or Fleet Administrator role")];
        const assignedRoles = Array.isArray(detail.assigned_roles)
          ? (detail.assigned_roles as unknown[]).map(String)
          : [user?.role, user?.department].filter(Boolean) as string[];
        setDenial({
          action: String(detail.action || detail.error || detail.message || "Fleet Hub rejected this action for privilege or scope reasons."),
          assignedRoles,
          requiredRoles,
          owners: Array.isArray(detail.role_crud_owners) ? detail.role_crud_owners as Denial["owners"] : undefined,
          resolution: typeof detail.resolution === "string" ? detail.resolution : undefined,
        });
      }
      return response;
    };
    return () => { window.fetch = original; };
  }, [user]);

  if (!denial) return null;
  const country = ({
    "1pwr_benin": "Benin",
    "1pwr_lesotho": "Lesotho",
    "1pwr_zambia": "Zambia",
  } as Record<string, string>)[String(user?.organizationId || "").toLowerCase()] || "Your country";
  const owners = denial.owners || [
    { owner: `${country} HR team`, manages: "Primary/secondary department assignments, Lead status, and scope." },
    { owner: "Nexus/IS&T User Administrator", manages: "Explicit Fleet Management access or denial in Nexus." },
    { owner: "Fleet Hub Administrator", manages: "Protected local fleet roles, approvers, and administrator actions." },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
      <div className="max-w-2xl w-full rounded-xl border border-red-200 bg-white shadow-xl overflow-hidden">
        <div className="bg-red-50 border-b border-red-200 p-5">
          <h2 className="text-lg font-semibold text-red-900">This action is not included in your current access</h2>
          <p className="text-sm text-red-700 mt-1">{denial.action}</p>
        </div>
        <div className="p-5 space-y-4 text-sm text-zinc-700">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-zinc-50 p-3"><strong>Your effective Fleet role(s)</strong><p className="font-mono mt-1">{denial.assignedRoles.join(", ") || "driver"}</p></div>
            <div className="rounded-lg bg-amber-50 p-3"><strong>Role or scope required</strong><p className="font-mono mt-1">{denial.requiredRoles.join(", ")}</p></div>
          </div>
          <div><strong>Who is responsible for changing access</strong><ul className="list-disc pl-5 mt-2 space-y-1">{owners.map((owner) => <li key={owner.owner}><strong>{owner.owner}:</strong> {owner.manages}</li>)}</ul></div>
          <p className="rounded-lg bg-blue-50 p-3 text-blue-900">{denial.resolution || "Ask the appropriate owner to correct the assignment, then sign out and back in to refresh your signed privileges."}</p>
          <button type="button" onClick={() => setDenial(null)} className="rounded-md bg-zinc-900 px-4 py-2 text-white">Close</button>
        </div>
      </div>
    </div>
  );
}
