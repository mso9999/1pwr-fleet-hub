"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface RefItem {
  id: string;
  organization_id: string;
  type: string;
  code: string;
  label: string;
  sort_order: number;
  active: number;
}

interface OrgRow {
  id: string;
  name: string;
  code: string;
  country: string;
}

const REF_TYPES = [
  { value: "site", label: "Sites / Destinations" },
  { value: "mission_type", label: "Mission Types" },
  { value: "third_party_shop", label: "3rd Party Shops" },
];

export default function AdminPage() {
  const { organizationId } = useAuth();
  const [items, setItems] = useState<RefItem[]>([]);
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [selectedType, setSelectedType] = useState("site");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editSort, setEditSort] = useState(0);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newSort, setNewSort] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetch("/api/organizations").then((r) => r.json()).then(setOrgs).catch(() => {});
  }, []);

  useEffect(() => {
    loadItems();
  }, [organizationId, selectedType]);

  function loadItems(): void {
    setIsLoading(true);
    fetch(`/api/reference-data?org=${organizationId}&type=${selectedType}`)
      .then((r) => r.json())
      .then((data) => { setItems(data); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }

  async function handleAdd(): Promise<void> {
    if (!newCode.trim() || !newLabel.trim()) return;
    await fetch("/api/reference-data", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        organization_id: organizationId,
        type: selectedType,
        code: newCode.trim().toUpperCase().replace(/\s+/g, "_"),
        label: newLabel.trim(),
        sort_order: newSort,
      }),
    });
    setNewCode("");
    setNewLabel("");
    setNewSort(0);
    loadItems();
  }

  async function handleUpdate(id: string): Promise<void> {
    await fetch(`/api/reference-data/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ label: editLabel, sort_order: editSort }),
    });
    setEditingId(null);
    loadItems();
  }

  async function handleToggleActive(item: RefItem): Promise<void> {
    await fetch(`/api/reference-data/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: item.active ? 0 : 1 }),
    });
    loadItems();
  }

  async function handleDelete(id: string): Promise<void> {
    if (!confirm("Delete this item permanently?")) return;
    await fetch(`/api/reference-data/${id}`, { method: "DELETE" });
    loadItems();
  }

  const currentOrg = orgs.find((o) => o.id === organizationId);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin — Reference Data</h1>
          <p className="text-slate-500">
            Manage dropdown options for{" "}
            <span className="font-semibold text-slate-700">{currentOrg?.name || organizationId}</span>
          </p>
        </div>
      </div>

      {/* Type selector */}
      <div className="flex gap-2 flex-wrap">
        {REF_TYPES.map((t) => (
          <button
            key={t.value}
            onClick={() => setSelectedType(t.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              selectedType === t.value
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Add new item */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add New {REF_TYPES.find((t) => t.value === selectedType)?.label}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 items-end flex-wrap">
            <Input label="Code" value={newCode} onChange={(e) => setNewCode(e.target.value)} className="w-32" placeholder="e.g. MAF" />
            <Input label="Display Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="w-64" placeholder="e.g. Mafeteng" />
            <Input label="Sort Order" type="number" value={newSort} onChange={(e) => setNewSort(Number(e.target.value))} className="w-24" />
            <Button onClick={handleAdd}>Add</Button>
          </div>
        </CardContent>
      </Card>

      {/* Items list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {REF_TYPES.find((t) => t.value === selectedType)?.label} ({items.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-400 py-4">Loading...</p>
          ) : items.length === 0 ? (
            <p className="text-slate-400 py-4">No items yet. Add one above.</p>
          ) : (
            <div className="divide-y">
              {items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 py-3">
                  <span className={`font-mono text-xs px-2 py-1 rounded ${item.active ? "bg-slate-100" : "bg-red-50 text-red-400 line-through"}`}>
                    {item.code}
                  </span>

                  {editingId === item.id ? (
                    <>
                      <input
                        value={editLabel}
                        onChange={(e) => setEditLabel(e.target.value)}
                        className="flex-1 px-2 py-1 border rounded text-sm"
                        autoFocus
                      />
                      <input
                        type="number"
                        value={editSort}
                        onChange={(e) => setEditSort(Number(e.target.value))}
                        className="w-16 px-2 py-1 border rounded text-sm"
                      />
                      <Button size="sm" onClick={() => handleUpdate(item.id)}>Save</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>Cancel</Button>
                    </>
                  ) : (
                    <>
                      <span className={`flex-1 text-sm ${!item.active ? "text-slate-400 line-through" : ""}`}>
                        {item.label}
                      </span>
                      <span className="text-xs text-slate-400 w-8 text-center">{item.sort_order}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingId(item.id); setEditLabel(item.label); setEditSort(item.sort_order); }}
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleToggleActive(item)}
                      >
                        {item.active ? "Disable" : "Enable"}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => handleDelete(item.id)}>
                        ✕
                      </Button>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
