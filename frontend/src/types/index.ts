export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'retry'
export type NodeType = 'scheduler' | 'worker'

export interface Task {
  id: string
  name: string
  status: TaskStatus
  node: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  retries: number
  maxRetries: number
  duration?: number
  logs: string[]
  owner?: string
  alertRecipients?: string[]
}

export interface Member {
  id: string
  name: string
  department: string
  onLeave: boolean
}

export interface HandoverRecord {
  id: string
  fromMemberId: string
  fromMemberName: string
  toMemberId: string
  toMemberName: string
  taskIds: string[]
  alertRecipientOfTaskIds: string[]
  createdAt: number
  reason: string
}

export interface ClusterNode {
  id: string
  name: string
  type: NodeType
  status: 'online' | 'offline' | 'overloaded'
  cpu: number
  memory: number
  tasks: number
  uptime: number
}

export interface MetricsSnapshot {
  time: number
  totalTasks: number
  runningTasks: number
  successRate: number
  avgLatency: number
  nodeCount: number
}
