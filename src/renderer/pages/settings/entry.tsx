import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  Button,
  Card,
  Checkbox,
  Col,
  ConfigProvider,
  Empty,
  Form,
  Grid,
  Input,
  Layout,
  Modal,
  Popconfirm,
  Row,
  Slider,
  Space,
  Table,
  Typography,
  message,
  theme,
} from "antd";
import {
  CheckOutlined,
  CopyOutlined,
  HistoryOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import dayjs from "dayjs";

import type { AppConfig, ScreenshotRecord } from "../../../common/types";
import { toAcceleratorFromKeydownLike } from "../../../common/hotkey";
import type { ColumnsType } from "antd/es/table";
import "antd/dist/reset.css";
import "../../shared/styles/index.css";
import appIconUrl from "../../shared/assets/app-icon.svg?url";

type SettingsFormValues = Pick<
  AppConfig,
  "hotkey" | "autoSaveToFile" | "saveDir" | "openEditorAfterCapture" | "maskAlpha"
>;

function isMacPlatform() {
  return typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
}

function SettingsApp() {
  const screens = Grid.useBreakpoint();
  const [form] = Form.useForm<SettingsFormValues>();
  const didInitRef = useRef(false);

  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [hotkeyRecordingOpen, setHotkeyRecordingOpen] = useState(false);
  const [pendingHotkey, setPendingHotkey] = useState<string | null>(null);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<ScreenshotRecord[]>([]);
  const [historyUpdatedAt, setHistoryUpdatedAt] = useState<number | null>(null);
  const autoSaveToFile = Form.useWatch("autoSaveToFile", form);
  const maskAlpha = Form.useWatch("maskAlpha", form);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const settings = await window.api.getSettings();
      form.setFieldsValue({
        hotkey: settings.hotkey,
        autoSaveToFile: settings.autoSaveToFile,
        saveDir: settings.saveDir,
        openEditorAfterCapture: settings.openEditorAfterCapture,
        maskAlpha: settings.maskAlpha,
      });
    } catch (error) {
      message.error("加载设置失败");
      console.error(error);
    } finally {
      setSettingsLoading(false);
    }
  }, [form]);

  const saveSettings = useCallback(async () => {
    try {
      const values = await form.validateFields();
      setSettingsSaving(true);

      const patch: Partial<AppConfig> = {
        hotkey: values.hotkey.trim(),
        autoSaveToFile: values.autoSaveToFile,
        saveDir: values.saveDir.trim(),
        openEditorAfterCapture: values.openEditorAfterCapture,
        maskAlpha: values.maskAlpha,
      };
      const updated = await window.api.updateSettings(patch);
      form.setFieldsValue({
        hotkey: updated.hotkey,
        saveDir: updated.saveDir,
        maskAlpha: updated.maskAlpha,
      });
      message.success("设置已保存");
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "errorFields" in error &&
        Array.isArray((error as any).errorFields)
      ) {
        return;
      }
      const errMsg =
        error && typeof error === "object" && "message" in error
          ? String((error as any).message || "")
          : "";
      message.error(errMsg ? `保存设置失败：${errMsg}` : "保存设置失败");
      console.error(error);
    } finally {
      setSettingsSaving(false);
    }
  }, [form]);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const list = await window.api.getHistory();
      setHistory(list);
      setHistoryUpdatedAt(Date.now());
    } catch (error) {
      message.error("加载历史失败");
      console.error(error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  const clearHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      await window.api.clearHistory();
      message.success("历史已清空");
      await loadHistory();
    } catch (error) {
      message.error("清空历史失败");
      console.error(error);
    } finally {
      setHistoryLoading(false);
    }
  }, [loadHistory]);

  const pinLast = useCallback(async () => {
    try {
      await window.api.pinLast();
      message.success("已贴最近截图");
    } catch (error) {
      message.error("贴最近截图失败");
      console.error(error);
    }
  }, []);

  useEffect(() => {
    if (!hotkeyRecordingOpen) return;
    setPendingHotkey(null);
    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        setHotkeyRecordingOpen(false);
        return;
      }
      if (e.key === "Backspace" || e.key === "Delete") {
        setPendingHotkey(null);
        return;
      }

      const accelerator = toAcceleratorFromKeydownLike(
        {
          key: e.key,
          ctrlKey: e.ctrlKey,
          altKey: e.altKey,
          shiftKey: e.shiftKey,
          metaKey: e.metaKey,
        },
        isMacPlatform() ? "mac" : "win"
      );
      if (accelerator) {
        setPendingHotkey(accelerator);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [hotkeyRecordingOpen]);

  useEffect(() => {
    if (didInitRef.current) return;
    didInitRef.current = true;
    void loadSettings();
    void loadHistory();
  }, [loadHistory, loadSettings]);

  const historyColumns: ColumnsType<ScreenshotRecord> = useMemo(() => {
    return [
      {
        title: "时间",
        dataIndex: "createdAt",
        width: 170,
        render: (createdAt: number) =>
          dayjs(createdAt).format("YYYY-MM-DD HH:mm:ss"),
      },
      {
        title: "文件路径",
        dataIndex: "filePath",
        ellipsis: true,
        render: (filePath: string) => (
          <Typography.Text
            style={{ maxWidth: "100%" }}
            ellipsis={{ tooltip: filePath }}
            copyable={{
              text: filePath,
              tooltips: ["复制路径", "已复制"],
              icon: [
                <CopyOutlined key="copy" />,
                <CheckOutlined key="copied" />,
              ],
            }}
          >
            {filePath}
          </Typography.Text>
        ),
      },
    ];
  }, []);

  const appTheme = useMemo(() => {
    return {
      algorithm: theme.defaultAlgorithm,
      token: {
        colorPrimary: "#23bfa4",
        colorInfo: "#3b82f6",
        colorSuccess: "#16a34a",
        colorWarning: "#f59e0b",
        colorError: "#ef4444",
        colorBgBase: "#f7fbff",
        colorBgContainer: "rgba(255, 255, 255, 0.72)",
        colorBgElevated: "rgba(255, 255, 255, 0.92)",
        colorBorderSecondary: "rgba(10, 24, 40, 0.08)",
        colorText: "rgba(10, 24, 40, 0.9)",
        colorTextSecondary: "rgba(10, 24, 40, 0.62)",
        borderRadius: 14,
        borderRadiusLG: 16,
        boxShadowTertiary: "0 18px 48px rgba(15, 23, 42, 0.14)",
      },
      components: {
        Layout: {
          bodyBg: "transparent",
          headerBg: "transparent",
        },
        Card: {
          headerBg: "transparent",
        },
        Table: {
          headerBg: "rgba(255, 255, 255, 0.64)",
          rowHoverBg: "rgba(35, 191, 164, 0.08)",
        },
        Input: {
          colorBgContainer: "rgba(255, 255, 255, 0.66)",
        },
      },
    } as const;
  }, []);

  return (
    <ConfigProvider theme={appTheme}>
      <Layout className="settings-shell">
        <div className="settings-shell__content">
          <Layout.Content style={{ padding: 24 }}>
            <div style={{ maxWidth: 1100, margin: "0 auto" }}>
              <Space size={10} align="center" style={{ marginBottom: 14 }}>
                <img
                  src={appIconUrl}
                  alt=""
                  width={22}
                  height={22}
                  style={{
                    borderRadius: 6,
                    boxShadow: "0 10px 22px rgba(15, 23, 42, 0.12)",
                  }}
                />
                <Typography.Title level={3} className="settings-title">
                  截图工具设置
                </Typography.Title>
              </Space>
              <Typography.Paragraph className="settings-subtitle">
                可自定义截图快捷键。管理保存策略与编辑器行为，历史记录支持复制路径与快速贴图。
              </Typography.Paragraph>

              <Row gutter={[16, 16]}>
                <Col xs={24} lg={10}>
                  <Card
                    className="settings-card"
                    title={
                      <Space size={10} align="center">
                        <SettingOutlined />
                        <span>设置</span>
                      </Space>
                    }
                    loading={settingsLoading}
                    bodyStyle={{ paddingBottom: 16 }}
                  >
                    <Form<SettingsFormValues>
                      form={form}
                      layout="vertical"
                      disabled={settingsLoading || settingsSaving}
                      initialValues={{
                        hotkey: "F1",
                        autoSaveToFile: false,
                        saveDir: "",
                        openEditorAfterCapture: false,
                        maskAlpha: 0.7,
                      }}
                    >
                      <Row gutter={12}>
                        <Col span={screens.lg ? 12 : 24}>
                          <Form.Item
                            label="截图快捷键"
                            name="hotkey"
                            rules={[
                              { required: true, message: "请设置截图快捷键" },
                              {
                                validator: async (_rule, value: unknown) => {
                                  const str = typeof value === "string" ? value.trim() : "";
                                  if (!str) throw new Error("请设置截图快捷键");
                                },
                              },
                            ]}
                          >
                            <Input
                              autoComplete="off"
                              readOnly
                              onClick={() => setHotkeyRecordingOpen(true)}
                              addonAfter={
                                <Space size={6}>
                                  <Button
                                    size="small"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      setHotkeyRecordingOpen(true);
                                    }}
                                  >
                                    修改
                                  </Button>
                                  <Button
                                    size="small"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      form.setFieldsValue({ hotkey: "F1" });
                                    }}
                                  >
                                    默认
                                  </Button>
                                </Space>
                              }
                            />
                          </Form.Item>
                        </Col>
                        <Col span={screens.lg ? 12 : 24}>
                          <Form.Item label="保存目录" name="saveDir">
                            <Input
                              placeholder="例如 C:\\Users\\...\\Pictures"
                              autoComplete="off"
                              disabled={!autoSaveToFile}
                            />
                          </Form.Item>
                        </Col>
                      </Row>

                      <Space
                        direction="vertical"
                        size={6}
                        style={{ width: "100%" }}
                      >
                        <Form.Item label="遮罩透明度" name="maskAlpha" style={{ marginBottom: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <Slider min={0.6} max={0.8} step={0.01} style={{ flex: 1 }} />
                            <Typography.Text style={{ minWidth: 56, textAlign: "right" }}>
                              {(typeof maskAlpha === "number" ? maskAlpha : 0.7).toFixed(2)}
                            </Typography.Text>
                          </div>
                        </Form.Item>
                        <Form.Item
                          name="autoSaveToFile"
                          valuePropName="checked"
                          style={{ marginBottom: 0 }}
                        >
                          <Checkbox>截图后自动保存到文件</Checkbox>
                        </Form.Item>
                        <Form.Item
                          name="openEditorAfterCapture"
                          valuePropName="checked"
                          style={{ marginBottom: 0 }}
                        >
                          <Checkbox>截图后自动打开编辑器</Checkbox>
                        </Form.Item>
                      </Space>

                      <div style={{ height: 14 }} />

                      <Space>
                        <Button
                          type="primary"
                          onClick={() => void saveSettings()}
                          loading={settingsSaving}
                          disabled={settingsLoading}
                        >
                          保存设置
                        </Button>
                        <Button
                          onClick={() => void loadSettings()}
                          loading={settingsLoading}
                          disabled={settingsSaving}
                        >
                          重新加载
                        </Button>
                      </Space>
                    </Form>
                  </Card>
                </Col>

                <Col xs={24} lg={14}>
                  <Card
                    className="settings-card"
                    title={
                      <Space size={10} align="center">
                        <HistoryOutlined />
                        <span>截图历史</span>
                        <Typography.Text type="secondary">
                          {historyUpdatedAt
                            ? `更新于 ${dayjs(historyUpdatedAt).format("HH:mm:ss")}`
                            : ""}
                        </Typography.Text>
                      </Space>
                    }
                    extra={
                      <Space>
                        <Button
                          onClick={() => void loadHistory()}
                          loading={historyLoading}
                        >
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
                        <Button
                          type="primary"
                          onClick={() => void pinLast()}
                          disabled={historyLoading}
                        >
                          贴最近截图
                        </Button>
                      </Space>
                    }
                    bodyStyle={{ paddingTop: 8 }}
                  >
                    <Table<ScreenshotRecord>
                      className="settings-table"
                      rowKey="id"
                      size="middle"
                      columns={historyColumns}
                      dataSource={history}
                      loading={historyLoading}
                      pagination={{
                        pageSize: 10,
                        showSizeChanger: true,
                        pageSizeOptions: [10, 20, 50],
                      }}
                      scroll={{ x: true, y: 420 }}
                      locale={{
                        emptyText: (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="暂无历史截图"
                          />
                        ),
                      }}
                    />
                  </Card>
                </Col>
              </Row>
            </div>
          </Layout.Content>
        </div>
      </Layout>
      <Modal
        title="录制截图快捷键"
        open={hotkeyRecordingOpen}
        onCancel={() => setHotkeyRecordingOpen(false)}
        footer={
          <Space>
            <Button onClick={() => setHotkeyRecordingOpen(false)}>取消</Button>
            <Button
              type="primary"
              disabled={!pendingHotkey}
              onClick={() => {
                if (!pendingHotkey) return;
                form.setFieldsValue({ hotkey: pendingHotkey });
                setHotkeyRecordingOpen(false);
                message.success("快捷键已更新，点击“保存设置”后生效");
              }}
            >
              使用该快捷键
            </Button>
          </Space>
        }
      >
        <Space direction="vertical" size={10} style={{ width: "100%" }}>
          <Typography.Text type="secondary">
            直接按下新的按键组合（例如 Ctrl + Shift + A）。按 Esc 退出录制。
          </Typography.Text>
          <Card size="small" style={{ background: "rgba(255,255,255,0.5)" }}>
            <Space direction="vertical" size={6} style={{ width: "100%" }}>
              <Typography.Text type="secondary">当前捕获</Typography.Text>
              <Typography.Text strong>
                {pendingHotkey ? pendingHotkey : "未捕获到有效快捷键"}
              </Typography.Text>
              <Typography.Text type="secondary">
                仅支持功能键（F1~F24）或带修饰键的组合键。
              </Typography.Text>
            </Space>
          </Card>
        </Space>
      </Modal>
    </ConfigProvider>
  );
}

const container = document.getElementById("app");
if (!container) {
  throw new Error("Renderer mount point #app not found");
}

createRoot(container).render(
  <React.StrictMode>
    <SettingsApp />
  </React.StrictMode>,
);
