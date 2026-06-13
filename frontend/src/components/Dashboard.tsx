import { useState, useEffect } from 'react'
import { Layout, Tabs, Statistic, Row, Col, Card, Tag, Button, Input, Table, Drawer, Descriptions, Space, Progress, Alert, Badge, Tooltip } from 'antd'
import { LineChart, Line, XAxis, YAxis, Tooltip as RTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts'
import { useTaskStore } from '../store/tasks'
import type { Task, TaskStatus, Member } from '../types'
import HandoverPanel from './HandoverPanel'
import { UserSwitchOutlined, BellOutlined } from '@ant-design/icons'

const { Header, Content } = Layout

const STATUS_COLORS: Record<TaskStatus, string> = {
  pending: 'default', running: 'processing', success: 'success', failed: 'error', retry: 'warning'
}

export default function Dashboard() {
  const store = useTaskStore()
  const [newTaskName, setNewTaskName] = useState('')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [activeTab, setActiveTab] = useState('metrics')

  useEffect(() => {
    store.syncFromBackend()
  }, [store])

  const taskColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: '名称', dataIndex: 'name', key: 'name' },
    { title: '状态', dataIndex: 'status', key: 'status', render: (s: TaskStatus) => <Tag color={STATUS_COLORS[s]}>{s}</Tag> },
    { title: '负责人', dataIndex: 'owner', key: 'owner', render: (owner: string, r: Task) => {
      const member = store.members.find(m => m.name === owner)
      return owner ? (
        <Tag color={member?.onLeave ? 'orange' : 'blue'}>
          {owner}{member?.onLeave && ' (请假中)'}
        </Tag>
      ) : '-'
    }},
    { title: '节点', dataIndex: 'node', key: 'node' },
    { title: '重试', key: 'retries', render: (_: any, r: Task) => `${r.retries}/${r.maxRetries}` },
    { title: '耗时', key: 'duration', render: (_: any, r: Task) => r.duration ? `${(r.duration / 1000).toFixed(1)}s` : '-' },
    { title: '操作', key: 'actions', render: (_: any, r: Task) => (
      <Space>
        {r.status === 'failed' && <Button size="small" type="primary" onClick={() => store.retryTask(r.id)}>重试</Button>}
        {r.status === 'running' && <Button size="small" danger onClick={() => store.cancelTask(r.id)}>取消</Button>}
        <Button size="small" onClick={() => { store.selectTask(r); setDrawerOpen(true) }}>详情</Button>
      </Space>
    )},
  ]

  const successCount = store.tasks.filter(t => t.status === 'success').length
  const failedCount = store.tasks.filter(t => t.status === 'failed').length
  const runningCount = store.tasks.filter(t => t.status === 'running').length

  const onLeaveMembers = store.members.filter(m => m.onLeave)
  const onLeaveWithTasks = onLeaveMembers.filter(m => {
    const owned = store.tasks.filter(t => t.owner === m.name).length
    const alerting = store.tasks.filter(t => t.alertRecipients?.includes(m.name)).length
    return owned > 0 || alerting > 0
  })

  const goHandover = (memberId?: string) => {
    setActiveTab('handover')
    if (memberId) {
      setTimeout(() => {
        const event = new CustomEvent('quick-handover', { detail: { memberId } })
        window.dispatchEvent(event)
      }, 50)
    }
  }

  const handleToggleLeave = async (member: Member) => {
    await store.toggleMemberLeave(member.id)
    if (!member.onLeave) {
      const owned = store.tasks.filter(t => t.owner === member.name).length
      const alerting = store.tasks.filter(t => t.alertRecipients?.includes(member.name)).length
      if (owned > 0 || alerting > 0) {
        setTimeout(() => goHandover(member.id), 100)
      }
    }
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <h1 style={{ color: 'white', margin: 0, fontSize: 18 }}>🔧 分布式任务调度与监控平台</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          {onLeaveWithTasks.length > 0 && (
            <Badge count={onLeaveWithTasks.length} offset={[-4, 4]}>
              <Tooltip title={`${onLeaveWithTasks.length} 位请假成员有待交接任务`}>
                <Button
                  icon={<BellOutlined />}
                  danger
                  onClick={() => goHandover(onLeaveWithTasks[0].id)}
                >
                  请假待交接
                </Button>
              </Tooltip>
            </Badge>
          )}
          <Input placeholder="任务名称" value={newTaskName} onChange={e => setNewTaskName(e.target.value)} style={{ width: 160 }} />
          <Button type="primary" onClick={() => { if (newTaskName) { store.addTask(newTaskName); setNewTaskName('') } }}>
            添加任务
          </Button>
        </div>
      </Header>
      <Content style={{ padding: 16 }}>
        {onLeaveWithTasks.length > 0 && (
          <Alert
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
            message={
              <span>
                以下成员正在请假中且有负责的任务或告警接收，请及时交接：
                <Space style={{ marginLeft: 8 }} wrap>
                  {onLeaveWithTasks.map(m => {
                    const owned = store.tasks.filter(t => t.owner === m.name).length
                    const alerting = store.tasks.filter(t => t.alertRecipients?.includes(m.name)).length
                    return (
                      <Button
                        key={m.id}
                        size="small"
                        type="primary"
                        danger
                        icon={<UserSwitchOutlined />}
                        onClick={() => goHandover(m.id)}
                      >
                        {m.name}（{owned} 任务 / {alerting} 告警）
                      </Button>
                    )
                  })}
                </Space>
              </span>
            }
          />
        )}

        {/* Stats */}
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}><Card><Statistic title="总任务" value={store.tasks.length} /></Card></Col>
          <Col span={6}><Card><Statistic title="运行中" value={runningCount} valueStyle={{ color: '#1890ff' }} /></Card></Col>
          <Col span={6}><Card><Statistic title="成功" value={successCount} valueStyle={{ color: '#52c41a' }} /></Card></Col>
          <Col span={6}><Card><Statistic title="失败" value={failedCount} valueStyle={{ color: '#ff4d4f' }} /></Card></Col>
        </Row>

        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={[
          { key: 'metrics', label: '监控指标', children: (
            <Row gutter={16}>
              <Col span={12}>
                <Card title="运行中任务数">
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={store.metrics}>
                      <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} fontSize={10} />
                      <YAxis fontSize={10} />
                      <RTooltip labelFormatter={t => new Date(t as number).toLocaleString()} />
                      <Area type="monotone" dataKey="runningTasks" stroke="#1890ff" fill="#1890ff" fillOpacity={0.3} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col span={12}>
                <Card title="成功率 %">
                  <ResponsiveContainer width="100%" height={200}>
                    <LineChart data={store.metrics}>
                      <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} fontSize={10} />
                      <YAxis domain={[0, 100]} fontSize={10} />
                      <RTooltip labelFormatter={t => new Date(t as number).toLocaleString()} />
                      <Line type="monotone" dataKey="successRate" stroke="#52c41a" strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
              <Col span={24} style={{ marginTop: 16 }}>
                <Card title="平均延迟 (ms)">
                  <ResponsiveContainer width="100%" height={150}>
                    <AreaChart data={store.metrics}>
                      <XAxis dataKey="time" tickFormatter={t => new Date(t).toLocaleTimeString()} fontSize={10} />
                      <YAxis fontSize={10} />
                      <RTooltip />
                      <Area type="monotone" dataKey="avgLatency" stroke="#faad14" fill="#faad14" fillOpacity={0.2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </Card>
              </Col>
            </Row>
          )},
          { key: 'tasks', label: '任务列表', children: (
            <Table dataSource={store.tasks} columns={taskColumns} rowKey="id" size="small" pagination={{ pageSize: 10 }} />
          )},
          { key: 'nodes', label: '集群节点', children: (
            <Row gutter={16}>
              {store.nodes.map(node => (
                <Col span={8} key={node.id} style={{ marginBottom: 16 }}>
                  <Card title={<span>{node.type === 'scheduler' ? '🎯' : '⚙️'} {node.name}</span>}
                    extra={<Tag color={node.status === 'online' ? 'green' : node.status === 'overloaded' ? 'orange' : 'red'}>{node.status}</Tag>}>
                    <Progress percent={Math.round(node.cpu)} strokeColor={node.cpu > 80 ? '#ff4d4f' : '#1890ff'} format={v => `CPU ${v}%`} />
                    <Progress percent={Math.round(node.memory)} strokeColor={node.memory > 80 ? '#ff4d4f' : '#52c41a'} format={v => `MEM ${v}%`} />
                    <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
                      任务数: {node.tasks} | 运行时间: {Math.floor(node.uptime / 3600)}h
                    </div>
                  </Card>
                </Col>
              ))}
            </Row>
          )},
          { key: 'handover', label: (
            <span>
              <UserSwitchOutlined /> 任务交接
              {onLeaveWithTasks.length > 0 && (
                <Badge count={onLeaveWithTasks.length} style={{ marginLeft: 6 }} />
              )}
            </span>
          ), children: <HandoverPanel onToggleLeave={handleToggleLeave} /> },
        ]} />

        {/* Task Detail Drawer */}
        <Drawer title="任务详情" open={drawerOpen} onClose={() => setDrawerOpen(false)} width={480}>
          {store.selectedTask && (
            <>
              <Descriptions column={1} bordered size="small">
                <Descriptions.Item label="ID">{store.selectedTask.id}</Descriptions.Item>
                <Descriptions.Item label="名称">{store.selectedTask.name}</Descriptions.Item>
                <Descriptions.Item label="状态"><Tag color={STATUS_COLORS[store.selectedTask.status]}>{store.selectedTask.status}</Tag></Descriptions.Item>
                <Descriptions.Item label="执行节点">{store.selectedTask.node}</Descriptions.Item>
                <Descriptions.Item label="负责人">
                  {store.selectedTask.owner ? (
                    <Tag color={store.members.find(m => m.name === store.selectedTask?.owner)?.onLeave ? 'orange' : 'blue'}>
                      {store.selectedTask.owner}
                    </Tag>
                  ) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="告警接收人">{store.selectedTask.alertRecipients?.length ? store.selectedTask.alertRecipients.map(r => <Tag key={r} color="orange">{r}</Tag>) : '-'}</Descriptions.Item>
                <Descriptions.Item label="重试次数">{store.selectedTask.retries}/{store.selectedTask.maxRetries}</Descriptions.Item>
                <Descriptions.Item label="创建时间">{new Date(store.selectedTask.createdAt).toLocaleString()}</Descriptions.Item>
                <Descriptions.Item label="耗时">{store.selectedTask.duration ? `${(store.selectedTask.duration / 1000).toFixed(1)}s` : '-'}</Descriptions.Item>
              </Descriptions>
              <h4 style={{ marginTop: 16 }}>执行日志</h4>
              <pre style={{ background: '#1f1f1f', padding: 12, borderRadius: 8, fontSize: 12, maxHeight: 300, overflow: 'auto', color: '#eee' }}>
                {store.selectedTask.logs.join('\n')}
              </pre>
            </>
          )}
        </Drawer>
      </Content>
    </Layout>
  )
}
