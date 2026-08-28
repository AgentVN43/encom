"use client";

import { useEffect, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";
import {
  countCardsInTopic,
  createV2Topic,
  deleteV2Topic,
  getV2Categories,
  getV2Topics,
  updateV2Topic,
  type V2Category,
  type V2Topic,
} from "@/lib/v2/db";
import {
  Button,
  Card,
  Typography,
  Drawer,
  Input,
  InputNumber,
  Select,
  message,
  Spin,
  Popconfirm,
  Empty,
} from "antd";
import { Plus, Edit2, Trash2, Layers } from "lucide-react";
import { Screen } from "@/components/ui/Layout";

const { Title, Text } = Typography;

/**
 * Chủ đề v2 = MỘT chức năng giao tiếp (Gợi ý, Đề nghị, Làm rõ, Theo dõi...).
 *
 * Cố tình không có trường ngữ cảnh ở đây: ngữ cảnh (họp/email/gọi/chat) gắn ở
 * từng thẻ và chọn được nhiều, vì một câu dùng lại được ở nhiều tình huống.
 * Gắn ngữ cảnh vào chủ đề là nhốt câu vào đúng một tình huống.
 */
export default function AdminV2TopicsPage() {
  const allowed = useAdminGuard();
  const [topics, setTopics] = useState<V2Topic[]>([]);
  const [categories, setCategories] = useState<V2Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<V2Topic | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [position, setPosition] = useState(0);
  const [saving, setSaving] = useState(false);

  async function loadData() {
    try {
      const [tops, cats] = await Promise.all([getV2Topics(), getV2Categories()]);
      setTopics(tops);
      setCategories(cats);
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
        const [tops, cats] = await Promise.all([
          getV2Topics(),
          getV2Categories(),
        ]);
        if (cancelled) return;
        setTopics(tops);
        setCategories(cats);
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

  const categoryName = (id: string | null) =>
    categories.find((c) => c.id === id)?.name ?? "Chưa thuộc nhóm nào";

  const visible = filterCat
    ? topics.filter((t) => t.category_id === filterCat)
    : topics;

  const openCreate = () => {
    setEditing(null);
    setName("");
    setDescription("");
    setCategoryId(filterCat || categories[0]?.id || "");
    setPosition(topics.length);
    setDrawerOpen(true);
  };

  const openEdit = (topic: V2Topic) => {
    setEditing(topic);
    setName(topic.name);
    setDescription(topic.description);
    setCategoryId(topic.category_id ?? "");
    setPosition(topic.position);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      message.error("Vui lòng nhập tên chủ đề");
      return;
    }
    if (!categoryId) {
      message.error("Vui lòng chọn nhóm");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim(),
        category_id: categoryId,
        position,
      };
      if (editing) {
        await updateV2Topic(editing.id, payload);
        message.success("Đã cập nhật chủ đề");
      } else {
        await createV2Topic(payload);
        message.success("Đã tạo chủ đề mới");
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

  const handleDelete = async (topic: V2Topic) => {
    try {
      const count = await countCardsInTopic(topic.id);
      if (count > 0) {
        message.error(
          `Còn ${count} thẻ trong chủ đề này — xoá chủ đề sẽ mất hết cả thẻ lẫn tiến độ học viên. Xoá hoặc chuyển thẻ đi trước.`
        );
        return;
      }
      await deleteV2Topic(topic.id);
      message.success("Đã xoá chủ đề");
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
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Title level={4} className="mb-1">
            Chức năng giao tiếp (v2)
          </Title>
          <Text type="secondary">
            Mỗi chủ đề là một chức năng: Gợi ý, Đề nghị, Làm rõ...
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

      <Select
        value={filterCat}
        onChange={setFilterCat}
        size="large"
        className="mb-4 w-full rounded-xl"
        options={[
          { value: "", label: "Tất cả nhóm" },
          ...categories.map((c) => ({ value: c.id, label: c.name })),
        ]}
      />

      {visible.length === 0 ? (
        <Empty description="Chưa có chủ đề nào" />
      ) : (
        <div className="space-y-3">
          {visible.map((topic) => (
            <Card key={topic.id} className="rounded-2xl border-0 shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                    <Layers size={20} className="text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <Text strong className="text-base">
                      {topic.name}
                    </Text>
                    <Text type="secondary" className="block text-sm">
                      {categoryName(topic.category_id)}
                    </Text>
                    {topic.description && (
                      <Text type="secondary" className="text-xs">
                        {topic.description}
                      </Text>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="text"
                    icon={<Edit2 size={16} />}
                    onClick={() => openEdit(topic)}
                    className="min-h-[44px] min-w-[44px]"
                  />
                  <Popconfirm
                    title="Xoá chủ đề này?"
                    description="Chỉ xoá được khi bên trong không còn thẻ nào"
                    onConfirm={() => handleDelete(topic)}
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
        title={editing ? "Sửa chủ đề" : "Thêm chủ đề mới"}
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
            <Text className="mb-1 block font-medium">Nhóm</Text>
            <Select
              value={categoryId || undefined}
              onChange={setCategoryId}
              size="large"
              className="w-full rounded-xl"
              placeholder="Chọn nhóm"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
          </div>
          <div>
            <Text className="mb-1 block font-medium">Tên chức năng</Text>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Đề nghị lịch họp, Làm rõ yêu cầu..."
              size="large"
              className="rounded-xl"
            />
            <Text type="secondary" className="mt-1 block text-xs">
              Đặt tên theo CHỨC NĂNG chứ không theo tình huống. &quot;Đề
              nghị&quot; đúng, &quot;Trong cuộc họp&quot; sai — tình huống là
              thẻ tự gắn được nhiều cái.
            </Text>
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
          </div>
        </div>
      </Drawer>
    </Screen>
  );
}
