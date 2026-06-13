import { useState, useEffect } from 'react'
import {
  Card, Select, Table, Tag, Button, Input, Space, Transfer, Modal,
  message, Descriptions, Timeline, Alert, Row, Col, Badge, Popconfirm,
  Empty, Divider, Tooltip,
} from 'antd'
import {
  SwapOutlined, UserSwitchOutlined, SyncOutlined,
  CheckCircleOutlined, UndoOutlined, ThunderboltOutlined,
  AuditOutlined,
} from '@ant-design/icons'
import { useTaskStore } from '../store/tasks'
import type { Member, HandoverRecord } from '../types'

interface Props {
  onToggleLeave?: (member: Member) => void
}

export default function HandoverPanel({ onToggleLeave }: Props) {
  const store = useTaskStore()
  const [fromMemberId, setFromMemberId] = useState<string | undefined>(undefined)
  const [toMemberId, setToMemberId] = useState<string | undefined>(undefined)
  const [selectedTaskKeys, setSelectedTaskKeys] = useState<string[]>([])
  const [selectedAlertKeys, setSelectedAlertKeys] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [detailRecord, setDetailRecord] = useState<HandoverRecord | null>(null)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    store.syncFromBackend()
  }, [store])

  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ memberId: string }>
      if (ce.detail?.memberId) {
        setFromMemberId(ce.detail.memberId)
        setSelectedTaskKeys([])
        setSelectedAlertKeys([])
        setToMemberId(undefined)
        setReason('')
      }
    }
    window.addEventListener('quick-handover', handler)
    return () => window.removeEventListener('quick-handover', handler)
  }, [])

  const handleSync = async () => {
    setSyncing(true)
    try {
      await store.syncFromBackend()
      messageApi.success('数据同步成功')
    } finally {
      setSyncing(false)
    }
  }

  const fromMember = store.members.find(m => m.id === fromMemberId)
  const onLeaveMembers = store.members.filter(m => m.onLeave)
  const availableMembers = store.members.filter(m => !m.onLeave && m.id !== fromMemberId)

  const tasksOwnedBy = fromMember
    ? store.tasks.filter(t => t.owner === fromMember.name)
    : []

  const tasksWithAlertRecipient = fromMember
    ? store.tasks.filter(t => t.alertRecipients?.includes(fromMember.name))
    : []

  const handleHandover = async () => {
    if (!fromMemberId || !toMemberId) return
    setLoading(true)
    try {
      const success = await store.handover(fromMemberId, toMemberId, selectedTaskKeys, selectedAlertKeys, reason)
      if (success) {
        messageApi.success('任务交接成功！')
        setConfirmOpen(false)
        setSelectedTaskKeys([])
        setSelectedAlertKeys([])
        setReason('')
        setFromMemberId(undefined)
        setToMemberId(undefined)
      } else {
        messageApi.error('任务交接失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleBatchHandover = async () => {
    if (!fromMemberId || !toMemberId) return
    setLoading(true)
    try {
      const success = await store.batchHandover(fromMemberId, toMemberId, reason || '请假批量交接')
      if (success) {
        messageApi.success('一键批量交接成功！')
        setSelectedTaskKeys([])
        setSelectedAlertKeys([])
        setReason('')
        setFromMemberId(undefined)
        setToMemberId(undefined)
      } else {
        messageApi.error('批量交接失败')
      }
    } finally {
      setLoading(false)
    }
  }

  const handleRevert = async (recordId: string) => {
    const success = await store.revertHandover(recordId)
    if (success) {
      messageApi.success('交接已撤销')
      setDetailRecord(prev => prev && prev.id === recordId ? { ...prev, reverted: true } : prev)
    } else {
      messageApi.error('撤销失败')
    }
  }

  const handleReview = async (recordId: string) => {
    const success = await store.reviewHandover(recordId)
    if (success) {
      messageApi.success('复核通过')
      setDetailRecord(prev => prev && prev.id === recordId ? { ...prev, reviewed: true } : prev)
    } else {
      messageApi.error('复核失败')
    }
  }

  const handleQuickStart = (member: Member) => {
    setFromMemberId(member.id)
    setSelectedTaskKeys([])
    setSelectedAlertKeys([])
    setToMemberId(undefined)
    setReason('')
  }

  const selectAllTasks = () => setSelectedTaskKeys(tasksOwnedBy.map(t => t.id))
  const selectAllAlerts = () => setSelectedAlertKeys(tasksWithAlertRecipient.map(t => t.id))
  const clearTaskSelection = () => setSelectedTaskKeys([])
  const clearAlertSelection = () => setSelectedAlertKeys([])

  const taskTransferDataSource = tasksOwnedBy.map(t => ({
    key: t.id,
    title: t.name,
    description: `${t.id} · ${t.status}`,
  }))

  const alertTransferDataSource = tasksWithAlertRecipient.map(t => ({
    key: t.id,
    title: t.name,
    description: `${t.id} · 告警接收人: ${(t.alertRecipients || []).join(', ')}`,
  }))

  const uncheckedRecords = store.handoverRecords.filter(r => !r.reviewed && !r.reverted)

  return (
    <div>
      {contextHolder}

      <Row gutter={16}>
        <Col span={16}>
          <Card
            title={<span><UserSwitchOutlined /> 任务交接</span>}
            style={{ marginBottom: 16 }}
            extra={
              <Button
                size="small"
                icon={<SyncOutlined />}
                loading={syncing}
                onClick={handleSync}
              >
                同步
              </Button>
            }
          >
            <Space direction="vertical" style={{ width: '100%' }} size="middle">
              {onLeaveMembers.length > 0 && (
                <Alert
                  type="warning"
                  showIcon
                  message="以下成员正在请假中，请及时交接任务"
                  description={
                    <div style={{ marginTop: 8 }}>
                      <Space wrap>
                        {onLeaveMembers.map(m => {
                          const owned = store.tasks.filter(t => t.owner === m.name).length
                          const alerting = store.tasks.filter(t => t.alertRecipients?.includes(m.name)).length
                          return (
                            <Button
                              key={m.id}
                              size="small"
                              type={owned > 0 || alerting > 0 ? 'primary' : 'default'}
                              danger={owned > 0 || alerting > 0}
                              onClick={() => handleQuickStart(m)}
                            >
                              {m.name}（{m.department}）- {owned} 任务 / {alerting} 告警
                            </Button>
                          )
                        })}
                      </Space>
                    </div>
                  }
                />
              )}

              <Row gutter={16}>
                <Col span={10}>
                  <div style={{ marginBottom: 4, fontWeight: 500 }}>交接发起人（请假人）</div>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="选择请假人员"
                    value={fromMemberId}
                    onChange={val => { setFromMemberId(val); setSelectedTaskKeys([]); setSelectedAlertKeys([]) }}
                    options={store.members.map(m => ({
                      value: m.id,
                      label: (
                        <span>
                          {m.name}
                          <Tag color={m.onLeave ? 'orange' : 'green'} style={{ marginLeft: 8 }}>
                            {m.onLeave ? '请假中' : '在岗'}
                          </Tag>
                          <span style={{ color: '#888', marginLeft: 4 }}>{m.department}</span>
                        </span>
                      ),
                    }))}
                  />
                </Col>
                <Col span={4} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4 }}>
                  <SwapOutlined style={{ fontSize: 20, color: '#1890ff' }} />
                </Col>
                <Col span={10}>
                  <div style={{ marginBottom: 4, fontWeight: 500 }}>交接接收人</div>
                  <Select
                    style={{ width: '100%' }}
                    placeholder="选择接收人"
                    value={toMemberId}
                    onChange={setToMemberId}
                    disabled={!fromMemberId}
                    options={availableMembers.map(m => ({
                      value: m.id,
                      label: (
                        <span>
                          {m.name}
                          <span style={{ color: '#888', marginLeft: 8 }}>{m.department}</span>
                        </span>
                      ),
                    }))}
                  />
                </Col>
              </Row>

              {fromMemberId && toMemberId && (
                <div style={{ background: '#f6f8fa', padding: '8px 12px', borderRadius: 6 }}>
                  <Row gutter={16}>
                    <Col span={6}>
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="负责任务">{tasksOwnedBy.length}</Descriptions.Item>
                      </Descriptions>
                    </Col>
                    <Col span={6}>
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="告警接收">{tasksWithAlertRecipient.length}</Descriptions.Item>
                      </Descriptions>
                    </Col>
                    <Col span={6}>
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label={<span style={{ color: selectedTaskKeys.length > 0 ? '#1890ff' : undefined }}>已选任务</span>}>
                          {selectedTaskKeys.length}
                        </Descriptions.Item>
                      </Descriptions>
                    </Col>
                    <Col span={6}>
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label={<span style={{ color: selectedAlertKeys.length > 0 ? '#fa8c16' : undefined }}>已选告警</span>}>
                          {selectedAlertKeys.length}
                        </Descriptions.Item>
                      </Descriptions>
                    </Col>
                  </Row>
                </div>
              )}

              {fromMember && (
                <>
                  <Card
                    type="inner"
                    title={`任务负责人移交（${fromMember.name} 负责的任务）`}
                    size="small"
                    extra={tasksOwnedBy.length > 0 && (
                      <Space size="small">
                        <Button size="small" type="link" onClick={selectAllTasks}>全选</Button>
                        <Button size="small" type="link" onClick={clearTaskSelection}>清空</Button>
                      </Space>
                    )}
                  >
                    {tasksOwnedBy.length > 0 ? (
                      <Transfer
                        dataSource={taskTransferDataSource}
                        targetKeys={selectedTaskKeys}
                        onChange={setSelectedTaskKeys}
                        render={item => item.title!}
                        titles={['待移交', '已选择']}
                        showSearch
                        listStyle={{ width: 280, height: 250 }}
                      />
                    ) : (
                      <Empty description="该成员暂无负责的任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>

                  <Card
                    type="inner"
                    title={`告警接收人移交（${fromMember.name} 接收告警的任务）`}
                    size="small"
                    extra={tasksWithAlertRecipient.length > 0 && (
                      <Space size="small">
                        <Button size="small" type="link" onClick={selectAllAlerts}>全选</Button>
                        <Button size="small" type="link" onClick={clearAlertSelection}>清空</Button>
                      </Space>
                    )}
                  >
                    {tasksWithAlertRecipient.length > 0 ? (
                      <Transfer
                        dataSource={alertTransferDataSource}
                        targetKeys={selectedAlertKeys}
                        onChange={setSelectedAlertKeys}
                        render={item => item.title!}
                        titles={['待移交', '已选择']}
                        showSearch
                        listStyle={{ width: 280, height: 250 }}
                      />
                    ) : (
                      <Empty description="该成员暂无告警接收任务" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    )}
                  </Card>
                </>
              )}

              {fromMemberId && toMemberId && (selectedTaskKeys.length > 0 || selectedAlertKeys.length > 0) && (
                <div>
                  <Input.TextArea
                    placeholder="交接原因（必填）"
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    rows={2}
                    style={{ marginBottom: 12 }}
                  />
                  <Button
                    type="primary"
                    block
                    onClick={() => setConfirmOpen(true)}
                    disabled={!reason.trim()}
                  >
                    确认交接（{selectedTaskKeys.length} 个任务 + {selectedAlertKeys.length} 个告警接收）
                  </Button>
                </div>
              )}

              {fromMemberId && toMemberId && (tasksOwnedBy.length > 0 || tasksWithAlertRecipient.length > 0) && selectedTaskKeys.length === 0 && selectedAlertKeys.length === 0 && (
                <div>
                  <Divider plain style={{ margin: '8px 0', fontSize: 12, color: '#999' }}>或者</Divider>
                  <Popconfirm
                    title="一键批量交接"
                    description={`将 ${fromMember?.name} 的所有 ${tasksOwnedBy.length} 个任务和 ${tasksWithAlertRecipient.length} 个告警接收全部移交给接收人，确认？`}
                    onConfirm={handleBatchHandover}
                    okText="确认"
                    cancelText="取消"
                  >
                    <Button block icon={<ThunderboltOutlined />} loading={loading}>
                      一键批量移交全部（{tasksOwnedBy.length} 任务 + {tasksWithAlertRecipient.length} 告警）
                    </Button>
                  </Popconfirm>
                </div>
              )}
            </Space>
          </Card>
        </Col>

        <Col span={8}>
          <Card title="团队成员" size="small" style={{ marginBottom: 16 }}>
            <Table
              dataSource={store.members}
              rowKey="id"
              size="small"
              pagination={false}
              columns={[
                { title: '姓名', dataIndex: 'name', key: 'name' },
                { title: '部门', dataIndex: 'department', key: 'department' },
                {
                  title: '状态',
                  key: 'status',
                  render: (_: any, r: Member) => (
                    <Tag
                      color={r.onLeave ? 'orange' : 'green'}
                      style={{ cursor: 'pointer' }}
                      onClick={() => onToggleLeave ? onToggleLeave(r) : store.toggleMemberLeave(r.id)}
                    >
                      {r.onLeave ? '请假中' : '在岗'}
                    </Tag>
                  ),
                },
                {
                  title: '',
                  key: 'action',
                  width: 50,
                  render: (_: any, r: Member) => {
                    if (!r.onLeave) return null
                    const count = store.tasks.filter(t => t.owner === r.name || t.alertRecipients?.includes(r.name)).length
                    return count > 0 ? (
                      <Tooltip title="快速交接">
                        <Button size="small" type="link" onClick={() => handleQuickStart(r)}>
                          <Badge count={count} size="small" offset={[4, -4]}>
                            <UserSwitchOutlined />
                          </Badge>
                        </Button>
                      </Tooltip>
                    ) : null
                  },
                },
              ]}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>点击状态标签可切换请假/在岗</div>
          </Card>

          <Card
            title={
              <span>
                <AuditOutlined style={{ marginRight: 4 }} />
                交接记录
                {uncheckedRecords.length > 0 && (
                  <Badge
                    count={uncheckedRecords.length}
                    style={{ marginLeft: 8 }}
                    overflowCount={99}
                  />
                )}
              </span>
            }
            size="small"
          >
            {store.handoverRecords.length === 0 ? (
              <Empty description="暂无交接记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            ) : (
              <Timeline
                items={store.handoverRecords.slice(0, 20).map(r => ({
                  color: r.reverted ? 'gray' : r.reviewed ? 'green' : 'blue',
                  children: (
                    <div
                      style={{
                        cursor: 'pointer',
                        padding: '4px 0',
                        opacity: r.reverted ? 0.5 : 1,
                      }}
                      onClick={() => setDetailRecord(r)}
                    >
                      <div>
                        <strong>{r.fromMemberName}</strong> → <strong>{r.toMemberName}</strong>
                        {r.reverted && <Tag color="default" style={{ marginLeft: 4 }}>已撤销</Tag>}
                        {r.reviewed && !r.reverted && <CheckCircleOutlined style={{ color: '#52c41a', marginLeft: 4 }} />}
                        {!r.reviewed && !r.reverted && (
                          <Tag color="orange" style={{ marginLeft: 4 }}>待复核</Tag>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: '#888' }}>
                        {r.taskIds.length} 个任务 · {r.alertRecipientOfTaskIds.length} 个告警
                      </div>
                      <div style={{ fontSize: 12, color: '#888' }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </div>
                      {r.reason && (
                        <div style={{ fontSize: 12, color: '#bbb', marginTop: 2 }}>{r.reason}</div>
                      )}
                    </div>
                  ),
                }))}
              />
            )}
          </Card>
        </Col>
      </Row>

      <Modal
        title="确认任务交接"
        open={confirmOpen}
        onOk={handleHandover}
        onCancel={() => setConfirmOpen(false)}
        okText="确认交接"
        cancelText="取消"
        confirmLoading={loading}
      >
        {fromMember && (
          <Descriptions column={1} bordered size="small">
            <Descriptions.Item label="发起人">{fromMember.name}</Descriptions.Item>
            <Descriptions.Item label="接收人">{store.members.find(m => m.id === toMemberId)?.name}</Descriptions.Item>
            <Descriptions.Item label="移交任务数">{selectedTaskKeys.length}</Descriptions.Item>
            <Descriptions.Item label="移交告警接收数">{selectedAlertKeys.length}</Descriptions.Item>
            <Descriptions.Item label="交接原因">{reason}</Descriptions.Item>
          </Descriptions>
        )}
        {selectedTaskKeys.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong>移交任务：</strong>
            <div style={{ marginTop: 4 }}>
              {selectedTaskKeys.map(id => {
                const task = store.tasks.find(t => t.id === id)
                return task ? <Tag key={id}>{task.name}</Tag> : null
              })}
            </div>
          </div>
        )}
        {selectedAlertKeys.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <strong>移交告警接收：</strong>
            <div style={{ marginTop: 4 }}>
              {selectedAlertKeys.map(id => {
                const task = store.tasks.find(t => t.id === id)
                return task ? <Tag key={id} color="orange">{task.name}</Tag> : null
              })}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        title={
          <span>
            <AuditOutlined style={{ marginRight: 4 }} />
            交接记录详情
            {detailRecord?.reverted && <Tag color="default" style={{ marginLeft: 8 }}>已撤销</Tag>}
            {detailRecord?.reviewed && !detailRecord?.reverted && <Tag color="green" style={{ marginLeft: 8 }}>已复核</Tag>}
            {!detailRecord?.reviewed && !detailRecord?.reverted && <Tag color="orange" style={{ marginLeft: 8 }}>待复核</Tag>}
          </span>
        }
        open={!!detailRecord}
        onCancel={() => setDetailRecord(null)}
        footer={
          detailRecord && !detailRecord.reverted ? [
            !detailRecord.reviewed && (
              <Button
                key="review"
                type="primary"
                icon={<CheckCircleOutlined />}
                onClick={() => handleReview(detailRecord.id)}
              >
                复核通过
              </Button>
            ),
            <Popconfirm
              key="revert"
              title="确认撤销此交接？"
              description="撤销后任务和告警接收人将恢复到交接前的状态"
              onConfirm={() => handleRevert(detailRecord.id)}
              okText="确认撤销"
              cancelText="取消"
            >
              <Button danger icon={<UndoOutlined />}>撤销交接</Button>
            </Popconfirm>,
            <Button key="close" onClick={() => setDetailRecord(null)}>关闭</Button>,
          ].filter(Boolean) : [
            <Button key="close" onClick={() => setDetailRecord(null)}>关闭</Button>,
          ]
        }
        width={560}
      >
        {detailRecord && (
          <div>
            <Descriptions column={2} bordered size="small">
              <Descriptions.Item label="交接发起人">{detailRecord.fromMemberName}</Descriptions.Item>
              <Descriptions.Item label="交接接收人">{detailRecord.toMemberName}</Descriptions.Item>
              <Descriptions.Item label="交接时间" span={2}>
                {new Date(detailRecord.createdAt).toLocaleString()}
              </Descriptions.Item>
              <Descriptions.Item label="交接原因" span={2}>
                {detailRecord.reason || '-'}
              </Descriptions.Item>
              <Descriptions.Item label="复核状态">
                {detailRecord.reverted
                  ? <Tag color="default">已撤销</Tag>
                  : detailRecord.reviewed
                    ? <Tag color="green">已复核</Tag>
                    : <Tag color="orange">待复核</Tag>
                }
              </Descriptions.Item>
              <Descriptions.Item label="任务数">
                {detailRecord.taskIds.length} 个任务 + {detailRecord.alertRecipientOfTaskIds.length} 个告警
              </Descriptions.Item>
            </Descriptions>

            {detailRecord.taskIds.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <strong>移交的任务：</strong>
                <div style={{ marginTop: 4 }}>
                  {detailRecord.taskIds.map(id => {
                    const task = store.tasks.find(t => t.id === id)
                    return task ? (
                      <Tag key={id} style={{ marginBottom: 4 }}>
                        {task.name}
                        <span style={{ color: '#888', marginLeft: 4, fontSize: 11 }}>({id})</span>
                      </Tag>
                    ) : <Tag key={id} style={{ marginBottom: 4 }}>{id}</Tag>
                  })}
                </div>
              </div>
            )}

            {detailRecord.alertRecipientOfTaskIds.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <strong>移交的告警接收：</strong>
                <div style={{ marginTop: 4 }}>
                  {detailRecord.alertRecipientOfTaskIds.map(id => {
                    const task = store.tasks.find(t => t.id === id)
                    return task ? (
                      <Tag key={id} color="orange" style={{ marginBottom: 4 }}>
                        {task.name}
                        <span style={{ color: '#888', marginLeft: 4, fontSize: 11 }}>({id})</span>
                      </Tag>
                    ) : <Tag key={id} color="orange" style={{ marginBottom: 4 }}>{id}</Tag>
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
