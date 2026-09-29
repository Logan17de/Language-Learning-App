"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DatabaseBackup,
  Download,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import {
  AdminPageHeader,
  AdminSection,
  AdminStatus,
} from "@/components/admin/admin-primitives";
import { Button } from "@/components/ui/button";
import { adminOperationsRepository } from "@/lib/repositories/admin-operations-repository";
import type { Database } from "@/types/database";

type FeatureFlagRow = Database["public"]["Tables"]["feature_flags"]["Row"];
type ServiceRow = Database["public"]["Tables"]["service_status"]["Row"];

export function AdminSettings() {
  const [flags, setFlags] = useState<FeatureFlagRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [auditCount, setAuditCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [workingId, setWorkingId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [featureFlags, serviceStatus, audit] = await Promise.all([
      adminOperationsRepository.listFeatureFlags(),
      adminOperationsRepository.listServiceStatus(),
      adminOperationsRepository.listAudit(),
    ]);
    if (featureFlags.ok) setFlags(featureFlags.data);
    else setError(featureFlags.error.message);
    if (serviceStatus.ok) setServices(serviceStatus.data);
    else setError((current) => current || serviceStatus.error.message);
    if (audit.ok) setAuditCount(audit.data.length);
    else setError((current) => current || audit.error.message);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFlag(flag: FeatureFlagRow) {
    setWorkingId(flag.id);
    setError("");
    setMessage("");
    const response = await fetch(
      `/api/admin/settings/feature-flags/${flag.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !flag.enabled }),
      },
    );
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setError(body?.error ?? "Feature flag could not be updated.");
    } else {
      setFlags((items) =>
        items.map((item) =>
          item.id === flag.id ? { ...item, enabled: !flag.enabled } : item,
        ),
      );
      setMessage(`${flag.key} ${flag.enabled ? "disabled" : "enabled"}.`);
    }
    setWorkingId("");
  }

  async function updateService(service: ServiceRow, status: string) {
    setWorkingId(service.id);
    setError("");
    setMessage("");
    const response = await fetch(`/api/admin/settings/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, detail: service.detail }),
    });
    const body = (await response.json().catch(() => null)) as
      | { error?: string }
      | null;
    if (!response.ok) {
      setError(body?.error ?? "Service status could not be updated.");
    } else {
      setServices((items) =>
        items.map((item) =>
          item.id === service.id ? { ...item, status } : item,
        ),
      );
      setMessage(`${service.service_name} marked ${status}.`);
    }
    setWorkingId("");
  }

  function exportConfiguration() {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            featureFlags: flags,
            serviceStatus: services,
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "aiko-admin-operational-config.json";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Production system configuration"
        title="Admin settings"
        description="Live operational feature flags and service-health records. Mutations are server-authorized and audit logged."
        actions={
          <Button
            type="button"
            variant="secondary"
            className="rounded-xl"
            disabled={loading}
            onClick={() => void load()}
          >
            <RefreshCw
              className={`size-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        }
      />
      {message && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800"
        >
          {message}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700"
        >
          {error}
        </p>
      )}
      {loading && !flags.length && !services.length ? (
        <div className="h-72 animate-pulse rounded-2xl bg-slate-100" />
      ) : (
        <div className="space-y-6">
          <AdminSection
            title="Feature flags"
            description="Persisted feature_flags rows. This screen changes only the enabled state."
          >
            {flags.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {flags.map((flag) => (
                  <button
                    key={flag.id}
                    type="button"
                    role="switch"
                    aria-checked={flag.enabled}
                    disabled={workingId === flag.id}
                    onClick={() => void toggleFlag(flag)}
                    className="flex min-h-20 items-center justify-between gap-4 rounded-xl border border-slate-200 p-4 text-left transition hover:border-teal-300 disabled:opacity-60"
                  >
                    <span className="min-w-0">
                      <strong className="block break-all text-sm">
                        {flag.key}
                      </strong>
                      <span className="mt-1 block text-xs leading-5 text-slate-500">
                        {flag.description || "No description"} ·{" "}
                        {flag.public ? "public" : "internal"}
                      </span>
                    </span>
                    <span
                      className={`relative h-6 w-11 shrink-0 rounded-full transition ${
                        flag.enabled ? "bg-teal-600" : "bg-slate-300"
                      }`}
                    >
                      <span
                        className={`absolute top-1 size-4 rounded-full bg-white transition ${
                          flag.enabled ? "left-6" : "left-1"
                        }`}
                      />
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                No feature flags are configured.
              </p>
            )}
          </AdminSection>

          <AdminSection
            title="Service status"
            description="Persisted operational status records shown to administrators."
          >
            {services.length ? (
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {services.map((service) => (
                  <label
                    key={service.id}
                    className="rounded-xl border border-slate-200 p-4"
                  >
                    <span className="mb-2 flex items-center justify-between gap-2 text-sm font-bold">
                      <span className="truncate">{service.service_name}</span>
                      <AdminStatus>{service.status}</AdminStatus>
                    </span>
                    <p className="mb-3 min-h-10 text-xs leading-5 text-slate-500">
                      {service.detail || "No service detail."}
                    </p>
                    <select
                      value={service.status}
                      disabled={workingId === service.id}
                      onChange={(event) =>
                        void updateService(service, event.target.value)
                      }
                      className="admin-input"
                    >
                      <option value="operational">operational</option>
                      <option value="degraded">degraded</option>
                      <option value="offline">offline</option>
                      <option value="maintenance">maintenance</option>
                    </select>
                  </label>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">
                No service-status rows are configured.
              </p>
            )}
          </AdminSection>

          <AdminSection title="Security & audit posture">
            <div className="grid gap-4 md:grid-cols-3">
              <Info
                icon={<ShieldCheck className="size-5" />}
                label="Mutation boundary"
                value="Server-authorized"
              />
              <Info
                icon={<DatabaseBackup className="size-5" />}
                label="Audit rows loaded"
                value={auditCount.toString()}
              />
              <Info
                icon={<Download className="size-5" />}
                label="Configuration export"
                value="Local JSON only"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-5 rounded-xl"
              onClick={exportConfiguration}
            >
              <Download className="size-4" /> Export operational config
            </Button>
          </AdminSection>
        </div>
      )}
    </>
  );
}

function Info({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-4">
      <span className="grid size-10 place-items-center rounded-xl bg-teal-50 text-teal-700">
        {icon}
      </span>
      <span>
        <span className="block text-xs text-slate-500">{label}</span>
        <strong className="text-sm">{value}</strong>
      </span>
    </div>
  );
}
