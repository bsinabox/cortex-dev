'use client';

import { useState, useCallback } from 'react';
import { useRealtimeTable } from '@/hooks/useRealtimeTable';
import {
  CONFIG_DISPLAY_KEYS,
  VPS_SERVICES,
  SEVERITY_CONFIG,
  timeAgo,
} from '@/lib/constants';
import { checkServiceStatus, executeVpsCommand, getOpsLog } from './actions';

type ConfigRow = {
  id: string; // key is the id for agentic_config
  key: string;
  value: unknown;
  updated_at: string;
};

type OpsLogEntry = {
  id: string;
  event_type: string;
  severity: string;
  description: string;
  status: string;
  item_id: string | null;
  created_at: string;
};

type ServiceStatus = {
  id: string;
  label: string;
  active: boolean;
  status: string;
  loading: boolean;
};

interface HealthDashboardProps {
  initialConfig: ConfigRow[];
  initialOpsLog: OpsLogEntry[];
  isOperator: boolean;
}

export function HealthDashboard({ initialConfig, initialOpsLog, isOperator }: HealthDashboardProps) {
  // Use key as ID for agentic_config (it's the PK)
  const configWithId = initialConfig.map((c) => ({ ...c, id: c.key }));
  const { data: configRows } = useRealtimeTable<ConfigRow>('agentic_config', configWithId);

  const [opsLog, setOpsLog] = useState<OpsLogEntry[]>(initialOpsLog);
  const [services, setServices] = useState<ServiceStatus[]>(
    VPS_SERVICES.map((s) => ({ ...s, active: false, status: 'unchecked', loading: false }))
  );
  const [vpsOutput, setVpsOutput] = useState<Record<string, { loading: boolean; result?: string; error?: string }>>({});

  // Build config map
  const configMap = configRows.reduce<Record<string, { value: unknown; updated_at: string }>>((acc, row) => {
    acc[row.key] = { value: row.value, updated_at: row.updated_at };
    return acc;
  }, {});

  // Extract conductor mode for the hero card
  const mode = typeof configMap.mode?.value === 'string'
    ? configMap.mode.value
    : JSON.stringify(configMap.mode?.value ?? 'unknown').replace(/"/g, '');

  const lastHeartbeat = configMap.last_heartbeat_at?.value;
  const heartbeatStr = typeof lastHeartbeat === 'string' ? lastHeartbeat : null;

  // Check all services
  const checkAllServices = useCallback(async () => {
    setServices((prev) => prev.map((s) => ({ ...s, loading: true })));
    for (const svc of VPS_SERVICES) {
      try {
        const result = await checkServiceStatus(svc.id);
        setServices((prev) =>
          prev.map((s) =>
            s.id === svc.id ? { ...s, active: result.active, status: result.status, loading: false } : s
          )
        );
      } catch {
        setServices((prev) =>
          prev.map((s) =>
            s.id === svc.id ? { ...s, status: 'error', loading: false } : s
          )
        );
      }
    }
  }, []);

  // VPS quick command
  const runQuickCommand = useCallback(async (id: string, command: string, args: string[], workDir: string) => {
    if (!isOperator) return;
    setVpsOutput((prev) => ({ ...prev, [id]: { loading: true } }));
    try {
      const result = await executeVpsCommand(command, args, workDir);
      setVpsOutput((prev) => ({
        ...prev,
        [id]: { loading: false, result: result.stdout ?? result.stderr ?? '', error: result.ok ? undefined : result.error },
      }));
    } catch (err) {
      setVpsOutput((prev) => ({
        ...prev,
        [id]: { loading: false, error: 'Command execution failed' },
      }));
    }
  }, [isOperator]);

  // Refresh ops log
  const refreshOpsLog = useCallback(async () => {
    const fresh = await getOpsLog() as OpsLogEntry[];
    setOpsLog(fresh);
  }, []);

  return (
    <div className="space-y-6">
      {/* Conductor mode hero */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Conductor Mode
          </p>
          <div className="mt-2 flex items-center gap-2">
            <span className={`h-3 w-3 rounded-full ${
              mode === 'live' ? 'bg-emerald-500 animate-pulse' :
              mode === 'paused' ? 'bg-amber-500' : 'bg-stone-400'
            }`} />
            <span className="text-xl font-bold capitalize">{mode}</span>
          </div>
        </div>

        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Last Heartbeat
          </p>
          <p className="mt-2 text-lg font-semibold">
            {heartbeatStr ? timeAgo(heartbeatStr) : 'N/A'}
          </p>
          {heartbeatStr && (
            <p className="mt-0.5 font-mono text-[10px] text-[var(--muted-foreground)]">
              {new Date(heartbeatStr).toLocaleString()}
            </p>
          )}
        </div>

        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Max Workers
          </p>
          <p className="mt-2 text-xl font-bold">
            {JSON.stringify(configMap.max_parallel_workers?.value ?? '—').replace(/"/g, '')}
          </p>
        </div>

        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-4">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--muted-foreground)]">
            Build Loop
          </p>
          <p className="mt-2 text-xl font-bold">
            {configMap.build_loop_enabled?.value === true ? '✓ Enabled' : '✗ Disabled'}
          </p>
        </div>
      </div>

      {/* Service status */}
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-semibold">VPS Services</h2>
          {isOperator && (
            <button
              onClick={checkAllServices}
              className="rounded-[8px] border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
            >
              Check all
            </button>
          )}
        </div>
        <div className="grid gap-0 divide-y divide-[var(--border)] sm:grid-cols-2 sm:divide-y-0 sm:divide-x">
          {services.map((svc) => (
            <div key={svc.id} className="flex items-center gap-3 px-5 py-3">
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                svc.status === 'unchecked' ? 'bg-stone-300' :
                svc.active ? 'bg-emerald-500' : 'bg-red-500'
              } ${svc.loading ? 'animate-pulse' : ''}`} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{svc.label}</p>
                <p className="truncate font-mono text-[10px] text-[var(--muted-foreground)]">{svc.id}</p>
              </div>
              <span className="text-xs text-[var(--muted-foreground)]">
                {svc.loading ? '...' : svc.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Config table */}
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)]">
        <div className="border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-semibold">Active Configuration</h2>
        </div>
        <div className="divide-y divide-[var(--border)]">
          {CONFIG_DISPLAY_KEYS.map((key) => {
            const entry = configMap[key];
            const displayValue = entry
              ? typeof entry.value === 'string'
                ? entry.value
                : JSON.stringify(entry.value)
              : '—';
            return (
              <div key={key} className="flex items-center justify-between px-5 py-2.5 text-sm">
                <span className="font-mono text-xs text-[var(--muted-foreground)]">{key}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-medium">{displayValue}</span>
                  {entry && (
                    <span className="text-[10px] text-[var(--muted-foreground)]">
                      {timeAgo(entry.updated_at)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* VPS Quick Commands — operator only */}
      {isOperator && (
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)]">
          <div className="border-b border-[var(--border)] px-5 py-3">
            <h2 className="text-sm font-semibold">VPS Quick Commands</h2>
          </div>
          <div className="grid gap-3 p-4 sm:grid-cols-3">
            <QuickCommandButton
              label="Health Check"
              description="Full VPS health report"
              loading={vpsOutput['health']?.loading ?? false}
              onClick={() => runQuickCommand('health', 'node', ['-e',
                'const fs=require("fs");const p=require("child_process");' +
                'console.log("=== DISK ===");console.log(p.execSync("df -h /").toString());' +
                'console.log("=== MEMORY ===");console.log(p.execSync("free -h").toString());' +
                'console.log("=== LOAD ===");console.log(p.execSync("uptime").toString());'
              ], '/tmp')}
            />
            <QuickCommandButton
              label="Git Status (BS Box)"
              description="bs-box-web dev branch"
              loading={vpsOutput['git-bsbox']?.loading ?? false}
              onClick={() => runQuickCommand('git-bsbox', 'git', ['log', '--oneline', '-5'], '/root/repos/bs-box-web')}
            />
            <QuickCommandButton
              label="Git Status (Cortex)"
              description="cortex-dev main branch"
              loading={vpsOutput['git-cortex']?.loading ?? false}
              onClick={() => runQuickCommand('git-cortex', 'git', ['log', '--oneline', '-5'], '/root/repos/cortex-dev')}
            />
          </div>
          {/* Command output */}
          {Object.entries(vpsOutput).map(([id, output]) => {
            if (!output.result && !output.error) return null;
            return (
              <div key={id} className="border-t border-[var(--border)] p-4">
                <p className="mb-1 text-xs font-medium text-[var(--muted-foreground)]">{id}</p>
                {output.error ? (
                  <p className="text-sm text-red-600">{output.error}</p>
                ) : (
                  <pre className="max-h-[200px] overflow-auto whitespace-pre-wrap font-mono text-xs text-[var(--foreground)]">
                    {output.result}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Ops log */}
      <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-5 py-3">
          <h2 className="text-sm font-semibold">Ops Log (24h)</h2>
          <button
            onClick={refreshOpsLog}
            className="rounded-[8px] border border-[var(--border)] px-3 py-1 text-xs text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)]"
          >
            Refresh
          </button>
        </div>
        {opsLog.length === 0 ? (
          <div className="px-5 py-8 text-center text-sm text-[var(--muted-foreground)]">
            No ops log entries in the last 24 hours
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] bg-[var(--muted)]">
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Time</th>
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Severity</th>
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Event</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Description</th>
                  <th className="whitespace-nowrap px-4 py-2 text-left text-xs font-medium text-[var(--muted-foreground)]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border)]">
                {opsLog.map((entry) => {
                  const sevCfg = SEVERITY_CONFIG[entry.severity] ?? SEVERITY_CONFIG.info;
                  return (
                    <tr key={entry.id} style={{ background: sevCfg.bg }}>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-[10px] text-[var(--muted-foreground)]">
                        {timeAgo(entry.created_at)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2">
                        <span
                          className="inline-flex rounded-[4px] border px-1.5 py-0.5 text-[10px] font-bold uppercase"
                          style={{ borderColor: sevCfg.border, color: sevCfg.text }}
                        >
                          {entry.severity}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">
                        {entry.event_type}
                      </td>
                      <td className="max-w-xs truncate px-4 py-2 text-xs">
                        {entry.description}
                      </td>
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-[var(--muted-foreground)]">
                        {entry.status}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function QuickCommandButton({
  label,
  description,
  loading,
  onClick,
}: {
  label: string;
  description: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="rounded-[8px] border border-[var(--border)] p-3 text-left transition-colors hover:bg-[var(--muted)] disabled:opacity-50"
    >
      <p className="text-sm font-medium">{label}</p>
      <p className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{description}</p>
      {loading && (
        <p className="mt-1 text-[10px] text-[var(--primary)]">Running...</p>
      )}
    </button>
  );
}
