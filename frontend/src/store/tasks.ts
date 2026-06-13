import { create } from 'zustand'
import type { Task, ClusterNode, MetricsSnapshot, TaskStatus, Member, HandoverRecord } from '../types'

const API_BASE = '/api'

async function safeFetch<T>(url: string, options?: RequestInit, fallback: T | null = null): Promise<T | null> {
  try {
    const res = await fetch(url, options)
    if (!res.ok) return fallback
    return await res.json()
  } catch {
    return fallback
  }
}

function mockMembers(): Member[] {
  return [
    { id: 'm-1', name: '张三', department: '基础架构', onLeave: false },
    { id: 'm-2', name: '李四', department: '基础架构', onLeave: true },
    { id: 'm-3', name: '王五', department: '数据平台', onLeave: false },
    { id: 'm-4', name: '赵六', department: '数据平台', onLeave: false },
    { id: 'm-5', name: '孙七', department: '运维', onLeave: true },
    { id: 'm-6', name: '周八', department: '运维', onLeave: false },
  ]
}

function mockNodes(): ClusterNode[] {
  return Array.from({ length: 5 }, (_, i) => ({
    id: `node-${i + 1}`,
    name: i === 0 ? 'scheduler-main' : `worker-${i}`,
    type: i === 0 ? 'scheduler' as const : 'worker' as const,
    status: Math.random() > 0.1 ? 'online' as const : 'overloaded' as const,
    cpu: 20 + Math.random() * 60,
    memory: 30 + Math.random() * 50,
    tasks: Math.floor(Math.random() * 8),
    uptime: 3600 + Math.floor(Math.random() * 86400),
  }))
}

function mockTasks(nodes: ClusterNode[], members: Member[]): Task[] {
  const names = ['data_sync', 'email_batch', 'report_gen', 'cache_warm', 'log_rotate', 'db_backup', 'index_rebuild', 'health_check']
  return Array.from({ length: 12 }, (_, i) => {
    const status: TaskStatus[] = ['pending', 'running', 'success', 'failed']
    const s = status[Math.floor(Math.random() * 4)]
    const node = nodes[Math.floor(Math.random() * nodes.length)]
    const owner = members[Math.floor(Math.random() * members.length)]
    const alertRecipients = members
      .filter(() => Math.random() > 0.5)
      .slice(0, 3)
      .map(m => m.name)
    return {
      id: `task-${1000 + i}`,
      name: names[i % names.length],
      status: s,
      node: node.name,
      createdAt: Date.now() - Math.floor(Math.random() * 600000),
      startedAt: s !== 'pending' ? Date.now() - Math.floor(Math.random() * 300000) : undefined,
      completedAt: (s === 'success' || s === 'failed') ? Date.now() - Math.floor(Math.random() * 60000) : undefined,
      retries: s === 'failed' ? Math.floor(Math.random() * 3) : 0,
      maxRetries: 3,
      duration: s === 'success' ? 1000 + Math.floor(Math.random() * 30000) : undefined,
      logs: [`[INFO] Task ${names[i % names.length]} started`, `[INFO] Processing on ${node.name}`],
      owner: owner.name,
      alertRecipients,
    }
  })
}

const initialNodes = mockNodes()
const initialMembers = mockMembers()

interface TaskStore {
  tasks: Task[]
  nodes: ClusterNode[]
  metrics: MetricsSnapshot[]
  selectedTask: Task | null
  members: Member[]
  handoverRecords: HandoverRecord[]
  addTask: (name: string) => void
  retryTask: (id: string) => void
  cancelTask: (id: string) => void
  selectTask: (t: Task | null) => void
  refreshNodes: () => void
  addMetric: () => void
  toggleMemberLeave: (memberId: string) => Promise<void>
  handover: (fromMemberId: string, toMemberId: string, taskIds: string[], alertRecipientOfTaskIds: string[], reason: string) => Promise<boolean>
  syncFromBackend: () => Promise<void>
}

export const useTaskStore = create<TaskStore>((set, get) => ({
  tasks: mockTasks(initialNodes, initialMembers),
  nodes: initialNodes,
  metrics: Array.from({ length: 20 }, (_, i) => ({
    time: Date.now() - (20 - i) * 5000,
    totalTasks: 100 + i * 2,
    runningTasks: 3 + Math.floor(Math.random() * 5),
    successRate: 85 + Math.random() * 14,
    avgLatency: 500 + Math.random() * 2000,
    nodeCount: 5,
  })),
  selectedTask: null,
  members: initialMembers,
  handoverRecords: [],
  addTask: (name) => {
    const members = get().members
    const owner = members[Math.floor(Math.random() * members.length)]
    const task: Task = {
      id: `task-${Date.now()}`,
      name, status: 'pending',
      node: get().nodes[Math.floor(Math.random() * get().nodes.length)].name,
      createdAt: Date.now(), retries: 0, maxRetries: 3, logs: [`[INFO] Task ${name} queued`],
      owner: owner.name,
      alertRecipients: members.filter(() => Math.random() > 0.5).slice(0, 3).map(m => m.name),
    }
    set({ tasks: [task, ...get().tasks] })
  },
  retryTask: (id) => set({
    tasks: get().tasks.map(t => t.id === id ? { ...t, status: 'pending', retries: t.retries + 1, logs: [...t.logs, '[INFO] Retrying...'] } : t)
  }),
  cancelTask: (id) => set({
    tasks: get().tasks.map(t => t.id === id ? { ...t, status: 'failed' as TaskStatus, logs: [...t.logs, '[WARN] Cancelled by user'] } : t)
  }),
  selectTask: (t) => set({ selectedTask: t }),
  refreshNodes: () => set({ nodes: mockNodes() }),
  addMetric: () => {
    const m: MetricsSnapshot = {
      time: Date.now(),
      totalTasks: get().tasks.length,
      runningTasks: get().tasks.filter(t => t.status === 'running').length,
      successRate: (get().tasks.filter(t => t.status === 'success').length / Math.max(get().tasks.length, 1)) * 100,
      avgLatency: 500 + Math.random() * 2000,
      nodeCount: get().nodes.filter(n => n.status !== 'offline').length,
    }
    set({ metrics: [...get().metrics.slice(-30), m] })
  },
  toggleMemberLeave: async (memberId) => {
    const data = await safeFetch<{ members: Member[] }>(
      `${API_BASE}/members/${memberId}/toggle_leave`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' } }
    )
    if (data && data.members) {
      set({ members: data.members })
    } else {
      set({
        members: get().members.map(m => m.id === memberId ? { ...m, onLeave: !m.onLeave } : m)
      })
    }
  },
  handover: async (fromMemberId, toMemberId, taskIds, alertRecipientOfTaskIds, reason) => {
    const data = await safeFetch<{ status: string; record: HandoverRecord }>(
      `${API_BASE}/handover`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_member_id: fromMemberId,
          to_member_id: toMemberId,
          task_ids: taskIds,
          alert_recipient_task_ids: alertRecipientOfTaskIds,
          reason: reason,
        }),
      }
    )

    if (data && data.status === 'ok' && data.record) {
      const state = get()
      const fromMember = state.members.find(m => m.id === fromMemberId)!
      const toMember = state.members.find(m => m.id === toMemberId)!

      const updatedTasks = state.tasks.map(t => {
        let updated = { ...t }
        if (taskIds.includes(t.id)) {
          updated = { ...updated, owner: toMember.name }
        }
        if (alertRecipientOfTaskIds.includes(t.id) && updated.alertRecipients) {
          updated = {
            ...updated,
            alertRecipients: updated.alertRecipients
              .filter(r => r !== fromMember.name)
              .concat(toMember.name),
          }
        }
        return updated
      })

      const normalizedRecord: HandoverRecord = {
        ...data.record,
        alertRecipientOfTaskIds: (data.record as any).alert_recipient_task_ids || [],
        createdAt: typeof (data.record as any).created_at === 'string'
          ? new Date((data.record as any).created_at).getTime()
          : (data.record as any).created_at || Date.now(),
      }

      set({
        tasks: updatedTasks,
        handoverRecords: [normalizedRecord, ...state.handoverRecords],
      })
      return true
    }

    const state = get()
    const fromMember = state.members.find(m => m.id === fromMemberId)!
    const toMember = state.members.find(m => m.id === toMemberId)!

    const updatedTasks = state.tasks.map(t => {
      let updated = { ...t }
      if (taskIds.includes(t.id)) {
        updated = { ...updated, owner: toMember.name }
      }
      if (alertRecipientOfTaskIds.includes(t.id) && updated.alertRecipients) {
        updated = {
          ...updated,
          alertRecipients: updated.alertRecipients
            .filter(r => r !== fromMember.name)
            .concat(toMember.name),
        }
      }
      return updated
    })

    const record: HandoverRecord = {
      id: `handover-${Date.now()}`,
      fromMemberId,
      fromMemberName: fromMember.name,
      toMemberId,
      toMemberName: toMember.name,
      taskIds,
      alertRecipientOfTaskIds,
      createdAt: Date.now(),
      reason,
    }

    set({
      tasks: updatedTasks,
      handoverRecords: [record, ...state.handoverRecords],
    })
    return true
  },
  syncFromBackend: async () => {
    const [tasksData, membersData, recordsData] = await Promise.all([
      safeFetch<{ tasks: any[] }>(`${API_BASE}/tasks`),
      safeFetch<{ members: Member[] }>(`${API_BASE}/members`),
      safeFetch<{ handover_records: any[] }>(`${API_BASE}/handover_records`),
    ])

    if (tasksData && tasksData.tasks) {
      const normalizedTasks: Task[] = tasksData.tasks.map(t => ({
        ...t,
        status: t.status as TaskStatus,
        createdAt: typeof t.created_at === 'string' ? new Date(t.created_at).getTime() : t.created_at,
        alertRecipients: t.alert_recipients,
        maxRetries: t.max_retries,
      }))
      set({ tasks: normalizedTasks })
    }

    if (membersData && membersData.members) {
      set({ members: membersData.members })
    }

    if (recordsData && recordsData.handover_records) {
      const normalized: HandoverRecord[] = recordsData.handover_records.map(r => ({
        ...r,
        alertRecipientOfTaskIds: r.alert_recipient_task_ids || [],
        createdAt: typeof r.created_at === 'string' ? new Date(r.created_at).getTime() : r.created_at,
      }))
      set({ handoverRecords: normalized })
    }
  },
}))
