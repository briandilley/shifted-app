/**
 * The table of the "Memory use" window: the memory of each Google app of each account,
 * from `app.getAppMetrics()`. See "Background loading" in `docs/spec/PRODUCT.md`.
 *
 * This module needs no Electron, so that unit tests can use it.
 */
import type { GoogleApp, MemoryUse } from '../shared/api'

/** The processes of one Google app of one account. */
export interface GoogleAppProcesses {
  accountName: string
  googleApp: GoogleApp
  /** The IDs of the processes of its page and of the frames in it, or `null` when asleep. */
  processIds: readonly number[] | null
}

/** The memory of one process, from `app.getAppMetrics()`. */
export interface ProcessMemory {
  pid: number
  /** `memory.workingSetSize`, in kilobytes. */
  kilobytes: number
}

/**
 * Make the table of the "Memory use" window. A process counts once: if two Google apps
 * share a process, the first one in the list gets its memory.
 */
export function memoryUse(
  apps: readonly GoogleAppProcesses[],
  processes: readonly ProcessMemory[]
): MemoryUse {
  const memory = new Map(processes.map((process) => [process.pid, process.kilobytes]))
  const counted = new Set<number>()
  const rows = apps.map(({ accountName, googleApp, processIds }) => {
    if (processIds === null) return { accountName, googleApp, kilobytes: null }
    let kilobytes = 0
    for (const pid of processIds) {
      if (counted.has(pid)) continue
      counted.add(pid)
      kilobytes += memory.get(pid) ?? 0
    }
    return { accountName, googleApp, kilobytes }
  })
  const totalKilobytes = processes.reduce((sum, process) => sum + process.kilobytes, 0)
  const appKilobytes = rows.reduce((sum, row) => sum + (row.kilobytes ?? 0), 0)
  return { rows, otherKilobytes: Math.max(0, totalKilobytes - appKilobytes), totalKilobytes }
}
