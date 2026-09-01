"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";
import {
  countCardsInCategory,
  createV2Category,
  deleteV2Category,
  getV2Categories,
  updateV2Category,
  type V2Category,
} from "@/lib/v2/db";
import {
  Button,
  Card,
  Typography,
  Drawer,
  Input,
  InputNumber,
  message,
  Spin,
  Popconfirm,
  Empty,
} from "antd";
import { Plus, Edit2, Trash2, FolderTree } from "lucide-react";
import { Screen } from "@/components/ui/Layout";

const { Title, Text } = Typography;

/**
 * Lĩnh vực sống của v2 — mặc định Work / Life / Social.
 *
 * Gắn ở TỪNG CÂU và ĐA TRỊ (qua bảng nối), không gắn ở chủ đề: "Can we
 * schedule a call?" vừa là Work vừa là Social, bắt chọn một là nhốt câu vào
 * một hoàn cảnh và mất khả năng dùng lại.
 *
 * Vẫn để sửa được thay vì cố định ba giá trị, vì codebase còn dùng cho ngôn
 * ngữ và lĩnh vực chuyên sâu khác — mỗi triển khai đặt bộ lĩnh vực riêng.
 */
export default function AdminV2CategoriesPage() {
  const allowed = useAdminGuard();
  const [items, setItems] = useState<V2Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<V2Category | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [position, setPosition] = useState(0);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      setItems(await getV2Categories());
    } catch (err: unknown) {
      message.error(
        "Lỗi tải dữ liệu: " +
          (err instanceof Error ? err.message : "Lỗi không xác định")
      );
    } finally {
      setLoading(false);
    }
  }

  // Tải lần đầu phải nằm trong IIFE bất đồng bộ chứ không gọi thẳng loadData:
  // gọi thẳng là đặt state đồng bộ ngay trong thân effect, gây render dây chuyền.
  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await getV2Categories();
        if (!cancelled) setItems(data);
      } catch (err: unknown) {
        if (!cancelled) {
          message.error(
            "Lỗi tải dữ liệu: " +
              (err instanceof Error ? err.message : "Lỗi không xác định")
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    // Đặt cuối danh sách — lĩnh vực mới thường là bổ sung
    setPosition(items.length);
    setDrawerOpen(true);
  };

  const openEdit = (item: V2Category) => {
    setEditing(item);
    setName(item.name);
    setDescription(item.description);
    setPosition(item.position);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      message.error("Vui lòng nhập tên lĩnh vực");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        position,
      };
      if (editing) {
        await updateV2Category(editing.id, payload);
        message.success("Đã cập nhật lĩnh vực");
      } else {
        await createV2Category(payload);
        message.success("Đã tạo lĩnh vực mới");
      }
      setDrawerOpen(false);
      loadData();
    } catch (err: unknown) {
      message.error(
        "Lỗi: " + (err instanceof Error ? err.message : "Lỗi không xác định")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (item: V2Category) => {
    try {
      // Cảnh báo chứ không chặn: xoá lĩnh vực KHÔNG mất câu, chỉ mất nhãn.
      // Khác hẳn xoá chủ đề — cái đó mất cả câu lẫn tiến độ học viên.
      const count = await countCardsInCategory(item.id);
      await deleteV2Category(item.id);
      message.success(
        count > 0
          ? `Đã xoá lĩnh vực — ${count} câu mất nhãn này nhưng vẫn học được`
          : "Đã xoá lĩnh vực"
      );
      loadData();
    } catch (err: unknown) {
      message.error(
        "Lỗi: " + (err instanceof Error ? err.message : "Lỗi không xác định")
      );
    }
  };

  if (!allowed || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Screen className="py-4">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <Title level={4} className="mb-1">
            Lĩnh vực (v2)
          </Title>
          <Text type="secondary">
            Work / Life / Social — gắn ở từng câu, một câu chọn được nhiều
          </Text>
        </div>
        <Button
          type="primary"
          icon={<Plus size={18} />}
          onClick={openCreate}
          className="min-h-[44px] rounded-xl"
        >
          Thêm
        </Button>
      </div>

      {items.length === 0 ? (
        <Empty description="Chưa có lĩnh vực nào" />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="rounded-2xl border-0 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                    <FolderTree size={20} className="text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <Text strong className="text-base">
                      {item.name}
                    </Text>
                    {item.description && (
                      <Text type="secondary" className="block text-xs">
                        {item.description}
                      </Text>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="text"
                    icon={<Edit2 size={16} />}
                    onClick={() => openEdit(item)}
                    className="min-h-[44px] min-w-[44px]"
                  />
                  <Popconfirm
                    title="Xoá lĩnh vực này?"
                    description="Câu vẫn còn nguyên, chỉ mất nhãn lĩnh vực này"
                    onConfirm={() => handleDelete(item)}
                    okText="Xoá"
                    cancelText="Huỷ"
                  >
                    <Button
                      type="text"
                      danger
                      icon={<Trash2 size={16} />}
                      className="min-h-[44px] min-w-[44px]"
                    />
                  </Popconfirm>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Drawer
        title={editing ? "Sửa lĩnh vực" : "Thêm lĩnh vực mới"}
        placement="bottom"
        onClose={() => setDrawerOpen(false)}
        open={drawerOpen}
        rootClassName="bottom-sheet"
        styles={{ wrapper: { height: "auto" } }}
        extra={
          <Button
            type="primary"
            loading={saving}
            onClick={handleSave}
            className="rounded-xl"
          >
            {editing ? "Lưu" : "Tạo"}
          </Button>
        }
      >
        <div className="drawer-handle" />
        <div className="mx-auto max-w-lg space-y-4">
          <div>
            <Text className="mb-1 block font-medium">Tên lĩnh vực</Text>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Work, Life, Social"
              size="large"
              className="rounded-xl"
            />
          </div>
          <div>
            <Text className="mb-1 block font-medium">Mô tả (không bắt buộc)</Text>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Mô tả ngắn"
              size="large"
              className="rounded-xl"
            />
          </div>
          <div>
            <Text className="mb-1 block font-medium">Thứ tự hiển thị</Text>
            <InputNumber
              value={position}
              onChange={(v) => setPosition(v ?? 0)}
              min={0}
              size="large"
              className="w-full rounded-xl"
            />
            <Text type="secondary" className="mt-1 block text-xs">
              Số nhỏ hiện trước. Trùng số thì xếp theo tên.
            </Text>
          </div>
        </div>
      </Drawer>
    </Screen>
  );
}
