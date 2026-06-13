import { useState, useEffect } from 'react'
import { Card, Select, Table, Tag, Button, Input, Space, Transfer, Modal, message, Descriptions, Timeline, Alert, Row, Col } from 'antd'
import { SwapOutlined, UserSwitchOutlined, SyncOutlined } from '@ant-design/icons'
import { useTaskStore } from '../store/tasks'
import type { Task, Member } from '../types'

export default function HandoverPanel() {
  const store = useTaskStore()
  const [fromMemberId, setFromMemberId] = useState<string | undefined>(undefined)
  const [toMemberId, setToMemberId] = useState<string | undefined>(undefined)
  const [selectedTaskKeys, setSelectedTaskKeys] = useState<string[]>([])
  const [selectedAlertKeys, setSelectedAlertKeys] = useState<string[]>([])
  const [reason, setReason] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [messageApi, contextHolder] = message.useMessage()

  useEffect(() => {
    store.syncFromBackend()
  }, [store])

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
                  message={`以下成员正在请假中：${onLeaveMembers.map(m => m.name).join('、')}，建议及时交接任务。`}
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

              {fromMember && (
                <>
                  <Card type="inner" title={`任务负责人移交（${fromMember.name} 负责的任务）`} size="small">
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
                      <div style={{ color: '#888', textAlign: 'center', padding: 24 }}>该成员暂无负责的任务</div>
                    )}
                  </Card>

                  <Card type="inner" title={`告警接收人移交（${fromMember.name} 接收告警的任务）`} size="small">
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
                      <div style={{ color: '#888', textAlign: 'center', padding: 24 }}>该成员暂无告警接收任务</div>
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
                  <Button type="primary" block onClick={() => setConfirmOpen(true)} disabled={!reason.trim()}>
                    确认交接（{selectedTaskKeys.length} 个任务 + {selectedAlertKeys.length} 个告警接收）
                  </Button>
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
                      onClick={() => store.toggleMemberLeave(r.id)}
                    >
                      {r.onLeave ? '请假中' : '在岗'}
                    </Tag>
                  ),
                },
              ]}
            />
            <div style={{ marginTop: 8, fontSize: 12, color: '#888' }}>点击状态标签可切换请假/在岗</div>
          </Card>

          <Card title="交接记录" size="small">
            {store.handoverRecords.length === 0 ? (
              <div style={{ color: '#888', textAlign: 'center', padding: 16 }}>暂无交接记录</div>
            ) : (
              <Timeline
                items={store.handoverRecords.slice(0, 10).map(r => ({
                  color: 'blue',
                  children: (
                    <div>
                      <div>
                        <strong>{r.fromMemberName}</strong> → <strong>{r.toMemberName}</strong>
                      </div>
                      <div style={{ fontSize: 12, color: '#888' }}>
                        {r.taskIds.length} 个任务 · {r.alertRecipientOfTaskIds.length} 个告警
                      </div>
                      <div style={{ fontSize: 12, color: '#888' }}>
                        {new Date(r.createdAt).toLocaleString()}
                      </div>
                      <div style={{ fontSize: 12, color: '#bbb' }}>{r.reason}</div>
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
    </div>
  )
}
