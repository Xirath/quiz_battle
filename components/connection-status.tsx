"use client";

import { useSocket, type ConnectionStatus } from "@/hooks/use-socket";

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; dotClass: string; textClass: string }
> = {
  connected: {
    label: "Game Server: Online",
    dotClass: "bg-success animate-pulse",
    textClass: "text-success font-medium",
  },
  connecting: {
    label: "Game Server: Connecting...",
    dotClass: "bg-warning animate-pulse",
    textClass: "text-warning",
  },
  disconnected: {
    label: "Game Server: Offline",
    dotClass: "bg-destructive",
    textClass: "text-destructive",
  },
  unauthorized: {
    label: "Game Server: Unauthenticated",
    dotClass: "bg-warning",
    textClass: "text-muted-foreground",
  },
  error: {
    label: "Game Server: Error",
    dotClass: "bg-destructive",
    textClass: "text-destructive",
  },
  idle: {
    label: "Game Server: Idle",
    dotClass: "bg-muted-foreground",
    textClass: "text-muted-foreground",
  },
};

export function ConnectionStatusBadge({ className = "" }: { className?: string }) {
  const { status } = useSocket();
  const config = STATUS_CONFIG[status];

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-1 text-xs shadow-xs ${className}`}
      title={config.label}
    >
      <span className={`h-2 w-2 rounded-full ${config.dotClass}`} />
      <span className={config.textClass}>{config.label}</span>
    </div>
  );
}
