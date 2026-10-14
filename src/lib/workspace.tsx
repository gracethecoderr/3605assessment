import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { type Column, type Priority, type RepairRequest } from "./data";
import { useAuth } from "./auth";
import { createRequest, listRequests, patchRequest } from "./requests.functions";

export type Toast = { id: number; message: string };

type WorkspaceValue = {
  requests: RepairRequest[];
  addRequest: (input: { title: string; address: string; priority: Priority }) => RepairRequest;
  updateRequest: (id: string, patch: Partial<RepairRequest>) => void;
  toasts: Toast[];
  notify: (message: string) => void;
  dismissToast: (id: number) => void;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { isSignedIn } = useAuth();
  const { data } = useQuery({
    queryKey: ["requests"],
    queryFn: () => listRequests(),
    enabled: isSignedIn,
    staleTime: Infinity,
  });
  const requests = useMemo(() => data ?? [], [data]);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = (message: string) => {
    const id = Date.now();
    setToasts((items) => [...items, { id, message }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 3500);
  };

  const value = useMemo<WorkspaceValue>(() => {
    const rollback = (message: string) => {
      notify(message);
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
    };
    return {
      requests,
      addRequest: ({ title, address, priority }) => {
        const nums = requests.map((item) => Number(item.id.replace("REQ-", "")));
        const nextNumber = (nums.length ? Math.max(...nums) : 108) + 1;
        const item: RepairRequest = {
          id: `REQ-${nextNumber}`,
          title,
          address,
          priority,
          column: "New",
          status: "Awaiting triage",
          waitingOn: "Property Manager",
          nextAction: "Review request & assign trade",
          waiting: "Just now",
          lastUpdate: "Just now",
        };
        queryClient.setQueryData<RepairRequest[]>(["requests"], (items) => [
          item,
          ...(items ?? []),
        ]);
        createRequest({ data: item }).catch(() => rollback("Could not save the new request"));
        return item;
      },
      updateRequest: (id, patch) => {
        queryClient.setQueryData<RepairRequest[]>(["requests"], (items) =>
          (items ?? []).map((item) => (item.id === id ? { ...item, ...patch } : item)),
        );
        const { id: _ignored, ...fields } = patch;
        patchRequest({ data: { id, patch: fields } }).catch(() =>
          rollback("Could not save the change"),
        );
      },
      toasts,
      notify,
      dismissToast: (id) => setToasts((items) => items.filter((item) => item.id !== id)),
    };
  }, [requests, toasts, queryClient]);

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return value;
}

export const columnStatus: Record<Column, string> = {
  New: "Awaiting triage",
  Waiting: "Waiting for response",
  "Action Needed": "Action required",
  Scheduled: "Booked",
  Completed: "Completed",
};
