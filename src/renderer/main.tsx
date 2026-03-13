import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, Card, Checkbox, Form, Input, Layout, Popconfirm, Space, Table, Typography, message } from 'antd'
import dayjs from 'dayjs'

import type { AppConfig, ScreenshotRecord } from '../common/types'
import type { ColumnsType } from 'antd/es/table'
import 'antd/dist/reset.css'

type SettingsFormValues = Pick<
  AppConfig,
  'hotkey' | 'autoSaveToFile' | 'saveDir' | 'openEditorAfterCapture'
>

function SettingsApp() {
  const [form] = Form.useForm<SettingsFormValues>()
  const didInitRef = useRef(false)

  const [settingsLoading, setSettingsLoading] = useState(false)
  const [settingsSaving, setSettingsSaving] = useState(false)

  const [historyLoading, setHistoryLoading] = useState(false)
  const [history, setHistory] = useState<ScreenshotRecord[]>([])

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true)
    try {
      const settings = await window.api.getSettings()
      form.setFieldsValue({
        hotkey: settings.hotkey,
        autoSaveToFile: settings.autoSaveToFile,
        saveDir: settings.saveDir,
        openEditorAfterCapture: settings.openEditorAfterCapture
      })
    } catch (error) {
      message.error('加载设置失败')
      console.error(error)
    } finally {
      setSettingsLoading(false)
    }
  }, [form])

  const saveSettings = useCallback(async () => {
    try {
      const values = await form.validateFields()
      setSettingsSaving(true)

      const patch: Partial<AppConfig> = {
        hotkey: values.hotkey.trim(),
        autoSaveToFile: values.autoSaveToFile,
        saveDir: values.saveDir.trim(),
        openEditorAfterCapture: values.openEditorAfterCapture
      }
      const updated = await window.api.updateSettings(patch)
      form.setFieldsValue({
        hotkey: updated.hotkey,
        saveDir: updated.saveDir
      })
      message.success('设置已保存')
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'errorFields' in error &&
        Array.isArray((error as any).errorFields)
      ) {
        return
      }
      message.error('保存设置失败')
      console.error(error)
    } finally {
      setSettingsSaving(false)
    }
  }, [form])

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const list = await window.api.getHistory()
      setHistory(list)
    } catch (error) {
      message.error('加载历史失败')
      console.error(error)
    } finally {
      setHistoryLoading(false)
    }
  }, [])

  const clearHistory = useCallback(async () => {
    try {
      setHistoryLoading(true)
      await window.api.clearHistory()
      message.success('历史已清空')
      await loadHistory()
    } catch (error) {
      message.error('清空历史失败')
      console.error(error)
    } finally {
      setHistoryLoading(false)
    }
  }, [loadHistory])

  const pinLast = useCallback(async () => {
    try {
      await window.api.pinLast()
      message.success('已贴最近截图')
    } catch (error) {
      message.error('贴最近截图失败')
      console.error(error)
    }
  }, [])

  useEffect(() => {
    if (didInitRef.current) return
    didInitRef.current = true
    void loadSettings()
    void loadHistory()
  }, [loadHistory, loadSettings])

  const historyColumns: ColumnsType<ScreenshotRecord> = useMemo(() => {
    return [
      {
        title: '时间',
        dataIndex: 'createdAt',
        width: 180,
        render: (createdAt: number) => dayjs(createdAt).format('YYYY-MM-DD HH:mm:ss')
      },
      {
        title: '文件路径',
        dataIndex: 'filePath',
        render: (filePath: string) => (
          <Typography.Text
            style={{ maxWidth: '100%' }}
            ellipsis={{ tooltip: filePath }}
            copyable={{ text: filePath }}
          >
            {filePath}
          </Typography.Text>
        )
      }
    ]
  }, [])

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Layout.Content style={{ padding: 24 }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <Typography.Title level={3} style={{ marginTop: 0 }}>
            截图工具设置
          </Typography.Title>

          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Card title="设置" loading={settingsLoading} bodyStyle={{ paddingBottom: 16 }}>
              <Form<SettingsFormValues>
                form={form}
                layout="vertical"
                initialValues={{
                  hotkey: '',
                  autoSaveToFile: false,
                  saveDir: '',
                  openEditorAfterCapture: false
                }}
              >
                <Form.Item
                  label="截图快捷键"
                  name="hotkey"
                  rules={[{ required: true, message: '请输入截图快捷键' }]}
                >
                  <Input placeholder="例如 F1 或 Ctrl+Shift+F1" autoComplete="off" />
                </Form.Item>

                <Form.Item name="autoSaveToFile" valuePropName="checked">
                  <Checkbox>截图后自动保存到文件</Checkbox>
                </Form.Item>

                <Form.Item label="保存目录" name="saveDir">
                  <Input placeholder="例如 C:\\Users\\...\\Pictures" autoComplete="off" />
                </Form.Item>

                <Form.Item name="openEditorAfterCapture" valuePropName="checked">
                  <Checkbox>截图后自动打开编辑器</Checkbox>
                </Form.Item>

                <Space>
                  <Button type="primary" onClick={() => void saveSettings()} loading={settingsSaving}>
                    保存设置
                  </Button>
                  <Button onClick={() => void loadSettings()} disabled={settingsSaving}>
                    重新加载
                  </Button>
                </Space>
              </Form>
            </Card>

            <Card
              title="截图历史"
              extra={
                <Space>
                  <Button onClick={() => void loadHistory()} loading={historyLoading}>
                    刷新
                  </Button>
                  <Popconfirm
                    title="确认清空历史？"
                    description="此操作不可恢复"
                    okText="清空"
                    cancelText="取消"
                    onConfirm={() => void clearHistory()}
                  >
                    <Button danger loading={historyLoading}>
                      清空历史
                    </Button>
                  </Popconfirm>
                  <Button onClick={() => void pinLast()} disabled={historyLoading}>
                    贴最近截图
                  </Button>
                </Space>
              }
              bodyStyle={{ paddingTop: 8 }}
            >
              <Table<ScreenshotRecord>
                rowKey="id"
                size="small"
                columns={historyColumns}
                dataSource={history}
                loading={historyLoading}
                pagination={{ pageSize: 10, showSizeChanger: true, pageSizeOptions: [10, 20, 50] }}
                locale={{ emptyText: '暂无历史截图' }}
              />
            </Card>
          </Space>
        </div>
      </Layout.Content>
    </Layout>
  )
}

const container = document.getElementById('app')
if (!container) {
  throw new Error('Renderer mount point #app not found')
}

createRoot(container).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>
)
