import { createSignal } from "solid-js";
import {
  trackDownload,
  completeDownload,
  failDownload,
  refetchInstances,
  refreshPinnedInstanceIds,
  showToast,
} from "../App";
import { resetActiveInstall, setActiveInstall } from "./installProgress";

export interface QueuedModpackTask {
  id: string; // dlId from trackDownload
  title: string;
  projectId: string;
  category: "modpack" | "instance";
  meta?: {
    iconUrl?: string | null;
    loader?: string;
    gameVersion?: string;
    versionNumber?: string | null;
    author?: string | null;
  };
  execute: () => Promise<any>;
}

const [activeModpackTask, setActiveModpackTask] = createSignal<QueuedModpackTask | null>(null);
const [queuedModpackTasks, setQueuedModpackTasks] = createSignal<QueuedModpackTask[]>([]);

export { activeModpackTask, queuedModpackTasks };

export function isModpackQueuedOrActive(projectId: string): boolean {
  const current = activeModpackTask();
  if (current && current.projectId === projectId) return true;
  return queuedModpackTasks().some((t) => t.projectId === projectId);
}

export function isModpackActive(dlId: string): boolean {
  return activeModpackTask()?.id === dlId;
}

export function enqueueModpack(
  task: Omit<QueuedModpackTask, "id">,
): string {
  const dlId = trackDownload(task.title, task.category, task.meta);
  const item: QueuedModpackTask = {
    ...task,
    id: dlId,
  };

  setQueuedModpackTasks((prev) => [...prev, item]);
  processQueue();
  return dlId;
}

export function cancelQueuedModpack(dlId: string): boolean {
  const list = queuedModpackTasks();
  const idx = list.findIndex((t) => t.id === dlId);
  if (idx !== -1) {
    const item = list[idx];
    setQueuedModpackTasks((prev) => prev.filter((t) => t.id !== dlId));
    failDownload(item.id, "Install cancelled");
    return true;
  }
  return false;
}

let isProcessing = false;

async function processQueue() {
  if (isProcessing || activeModpackTask() !== null) {
    return;
  }

  const queue = queuedModpackTasks();
  if (queue.length === 0) {
    return;
  }

  isProcessing = true;
  const nextTask = queue[0];
  // Pop first item from queued tasks and set as active task
  setQueuedModpackTasks((prev) => prev.slice(1));
  setActiveModpackTask(nextTask);

  // Clear previous installation state completely so progress starts at 0%
  resetActiveInstall();
  setActiveInstall({
    active: true,
    title: nextTask.title,
    message: "Starting installation...",
    fraction: 0,
    done: false,
    cancelling: false,
  });

  try {
    await nextTask.execute();
    await refetchInstances();
    refreshPinnedInstanceIds().catch(() => {});
    completeDownload(nextTask.id);
  } catch (e: any) {
    const isCancelled = typeof e === "string" && e.includes("cancelled");
    if (isCancelled) {
      failDownload(nextTask.id, "Install cancelled");
    } else {
      console.error("Modpack install failed:", e);
      failDownload(nextTask.id, typeof e === "string" ? e : (e?.message || "Installation failed"));
      showToast({
        title: "Install failed",
        message: `${nextTask.title}: ${typeof e === "string" ? e : (e?.message || "Unknown error")}`,
        type: "error",
        autoCloseMs: 8000,
      });
    }
  } finally {
    setActiveModpackTask(null);
    resetActiveInstall();
    isProcessing = false;
    // Automatically advance to the next queued modpack
    processQueue();
  }
}
