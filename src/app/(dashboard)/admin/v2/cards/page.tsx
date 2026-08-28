"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";
import {
  createV2Card,
  deleteV2Card,
  getV2Cards,
  getV2Chunks,
  getV2Topics,
  replaceChunks,
  updateV2Card,
  type V2Topic,
} from "@/lib/v2/db";
import {
  chunksToSentence,
  formatChunks,
  parseChunks,
} from "@/lib/v2/session";
import type { V2Card, V2Chunk, V2Context } from "@/lib/v2/types";
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
import { Plus, Edit2, Trash2, MessageSquareText } from "lucide-react";
import { Screen } from "@/components/ui/Layout";

const { Title, Text } = Typography;

const CONTEXT_OPTIONS: { value: V2Context; label: string }[] = [
  { value: "meeting", label: "Họp" },
  { value: "email", label: "Email" },
  { value: "call", label: "Điện thoại" },
  { value: "chat", label: "Nhắn tin" },
];

export default function AdminV2CardsPage() {
  const allowed = useAdminGuard();
  const [topics, setTopics] = useState<V2Topic[]>([]);
  const [topicId, setTopicId] = useState("");
  const [cards, setCards] = useState<V2Card[]>([]);
  const [chunksByCard, setChunksByCard] = useState<Record<string, V2Chunk[]>>({});
  const [loading, setLoading] = useState(true);
  const [loadingCards, setLoadingCards] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<V2Card | null>(null);
  const [vietnamese, setVietnamese] = useState("");
  /** Dòng tiếng Anh có ngoặc vuông đánh dấu chỗ thay được */
  const [englishLine, setEnglishLine] = useState("");
  const [contexts, setContexts] = useState<V2Context[]>([]);
  const [position, setPosition] = useState(0);
  const [saving, setSaving] = useState(false);

  /** Xem trước mẩu ngay khi gõ — sai ngoặc là thấy liền, không phải lưu rồi mới biết */
  const draftChunks = useMemo(
    () => parseChunks(englishLine),
    [englishLine]
  );
  const previewSentence = useMemo(
    () => chunksToSentence(draftChunks),
    [draftChunks]
  );

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      try {
        const tops = await getV2Topics();
        setTopics(tops);
        setTopicId(tops[0]?.id ?? "");
      } catch (err: unknown) {
        message.error(
          "Lỗi tải chủ đề: " +
            (err instanceof Error ? err.message : "Lỗi không xác định")
        );
      } finally {
        setLoading(false);
      }
    })();
  }, [allowed]);

  async function loadCards(id: string) {
    if (!id) {
      setCards([]);
      setChunksByCard({});
      return;
    }
    setLoadingCards(true);
    try {
      const rows = await getV2Cards(id);
      setCards(rows);

      // Lấy mẩu của cả chủ đề trong một request — danh sách cần hiện số mẩu
      // của từng thẻ để admin biết thẻ nào chưa chia
      const chunks = await getV2Chunks(rows.map((c) => c.id));
      const grouped: Record<string, V2Chunk[]> = {};
      for (const ch of chunks) (grouped[ch.card_id] ??= []).push(ch);
      setChunksByCard(grouped);
    } catch (err: unknown) {
      message.error(
        "Lỗi tải thẻ: " +
          (err instanceof Error ? err.message : "Lỗi không xác định")
      );
    } finally {
      setLoadingCards(false);
    }
  }

  // Cờ huỷ không chỉ để tránh đặt state sau khi rời trang: đổi chủ đề nhanh
  // hai lần thì lượt cũ về sau lượt mới sẽ ghi đè danh sách bằng thẻ của chủ
  // đề trước đó.
  useEffect(() => {
    if (!allowed || !topicId) return;
    let cancelled = false;
    (async () => {
      setLoadingCards(true);
      try {
        const rows = await getV2Cards(topicId);
        if (cancelled) return;
        setCards(rows);

        const chunks = await getV2Chunks(rows.map((c) => c.id));
        if (cancelled) return;
        const grouped: Record<string, V2Chunk[]> = {};
        for (const ch of chunks) (grouped[ch.card_id] ??= []).push(ch);
        setChunksByCard(grouped);
      } catch (err: unknown) {
        if (!cancelled) {
          message.error(
            "Lỗi tải thẻ: " +
              (err instanceof Error ? err.message : "Lỗi không xác định")
          );
        }
      } finally {
        if (!cancelled) setLoadingCards(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [allowed, topicId]);

  const openCreate = () => {
    setEditing(null);
    setVietnamese("");
    setEnglishLine("");
    setContexts([]);
    setPosition(cards.length);
    setDrawerOpen(true);
  };

  const openEdit = (card: V2Card) => {
    setEditing(card);
    setVietnamese(card.vietnamese_text);
    // Dựng lại dòng có ngoặc từ mẩu đã lưu; thẻ chưa chia mẩu thì lấy câu gốc
    const existing = chunksByCard[card.id] ?? [];
    setEnglishLine(
      existing.length > 0 ? formatChunks(existing) : card.english_text
    );
    setContexts(card.context_tags);
    setPosition(card.position);
    setDrawerOpen(true);
  };

  const handleSave = async () => {
    if (!vietnamese.trim()) {
      message.error("Vui lòng nhập câu tiếng Việt");
      return;
    }
    if (draftChunks.length === 0) {
      message.error("Vui lòng nhập câu tiếng Anh");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        topic_id: topicId,
        vietnamese_text: vietnamese.trim(),
        // Câu hoàn chỉnh suy từ mẩu, không bắt gõ hai lần — gõ hai lần là hai
        // bản dễ lệch, mà lệch thì bài ôn chấm một đằng hiện một nẻo
        english_text: previewSentence,
        context_tags: contexts,
        position,
      };

      // Ghi thẻ trước rồi mới ghi mẩu: mẩu cần card_id, và nếu bước hai hỏng
      // thì thẻ vẫn còn đó để sửa lại, không mất công gõ
      const cardId = editing
        ? (await updateV2Card(editing.id, payload), editing.id)
        : (await createV2Card(payload)).id;

      await replaceChunks(cardId, draftChunks);

      message.success(editing ? "Đã cập nhật thẻ" : "Đã tạo thẻ mới");
      setDrawerOpen(false);
      loadCards(topicId);
    } catch (err: unknown) {
      message.error(
        "Lỗi: " + (err instanceof Error ? err.message : "Lỗi không xác định")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (card: V2Card) => {
    try {
      await deleteV2Card(card.id);
      message.success("Đã xoá thẻ");
      loadCards(topicId);
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

  if (topics.length === 0) {
    return (
      <Screen className="py-4">
        <Empty description="Chưa có chủ đề nào — tạo chủ đề trước khi thêm thẻ" />
      </Screen>
    );
  }

  return (
    <Screen className="py-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <Title level={4} className="mb-1">
            Câu mẫu (v2)
          </Title>
          <Text type="secondary">Mỗi thẻ là một câu, chia sẵn thành mẩu</Text>
        </div>
        <Button
          type="primary"
          icon={<Plus size={18} />}
          onClick={openCreate}
          disabled={!topicId}
          className="min-h-[44px] rounded-xl"
        >
          Thêm
        </Button>
      </div>

      <Select
        value={topicId || undefined}
        onChange={setTopicId}
        size="large"
        className="mb-4 w-full rounded-xl"
        placeholder="Chọn chủ đề"
        options={topics.map((t) => ({ value: t.id, label: t.name }))}
      />

      {loadingCards ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Spin />
        </div>
      ) : cards.length === 0 ? (
        <Empty description="Chủ đề này chưa có thẻ nào" />
      ) : (
        <div className="space-y-3">
          {cards.map((card) => {
            const chunks = chunksByCard[card.id] ?? [];
            return (
              <Card key={card.id} className="rounded-2xl border-0 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
                      <MessageSquareText size={20} className="text-indigo-600" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Text strong className="block text-base">
                        {card.english_text}
                      </Text>
                      <Text type="secondary" className="block text-sm">
                        {card.vietnamese_text}
                      </Text>

                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {chunks.length === 0 ? (
                          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
                            Chưa chia mẩu — không ra được bài ôn
                          </span>
                        ) : (
                          chunks.map((ch) => (
                            <span
                              key={ch.id}
                              className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                                ch.kind === "slot"
                                  ? "bg-amber-50 text-amber-700"
                                  : "bg-slate-100 text-slate-600"
                              }`}
                            >
                              {ch.text}
                            </span>
                          ))
                        )}
                      </div>

                      {card.context_tags.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {card.context_tags.map((tag) => (
                            <span
                              key={tag}
                              className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"
                            >
                              {CONTEXT_OPTIONS.find((o) => o.value === tag)
                                ?.label ?? tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="text"
                      icon={<Edit2 size={16} />}
                      onClick={() => openEdit(card)}
                      className="min-h-[44px] min-w-[44px]"
                    />
                    <Popconfirm
                      title="Xoá thẻ này?"
                      description="Mất cả mẩu câu và tiến độ học viên với thẻ này"
                      onConfirm={() => handleDelete(card)}
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
            );
          })}
        </div>
      )}

      <Drawer
        title={editing ? "Sửa thẻ" : "Thêm thẻ mới"}
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
            <Text className="mb-1 block font-medium">Câu tiếng Việt</Text>
            <Input.TextArea
              value={vietnamese}
              onChange={(e) => setVietnamese(e.target.value)}
              placeholder="VD: Mình sắp xếp một cuộc gọi tuần sau nhé?"
              autoSize={{ minRows: 2, maxRows: 4 }}
              size="large"
              className="rounded-xl"
            />
            <Text type="secondary" className="mt-1 block text-xs">
              Đây là mặt trước thẻ. Người học đọc câu này rồi tự nghĩ ra câu
              tiếng Anh.
            </Text>
          </div>

          <div>
            <Text className="mb-1 block font-medium">
              Câu tiếng Anh, chia mẩu bằng ngoặc vuông
            </Text>
            <Input.TextArea
              value={englishLine}
              onChange={(e) => setEnglishLine(e.target.value)}
              placeholder="Can we schedule [a call] [next week]?"
              autoSize={{ minRows: 2, maxRows: 4 }}
              size="large"
              className="rounded-xl font-mono"
            />
            <Text type="secondary" className="mt-1 block text-xs">
              Đặt trong <code>[ ]</code> phần ĐỔI ĐƯỢC sang tình huống khác.
              Phần ngoài ngoặc là khung cố định. Người học sẽ phải ghép lại
              đúng thứ tự các mẩu này.
            </Text>
          </div>

          {/* Xem trước: sai ngoặc là thấy ngay, không phải lưu rồi mở lại mới biết */}
          {draftChunks.length > 0 && (
            <div className="rounded-xl bg-slate-50 p-3">
              <Text className="mb-2 block text-xs font-medium">
                Xem trước — {draftChunks.length} mẩu
              </Text>
              <div className="flex flex-wrap gap-1.5">
                {draftChunks.map((ch, i) => (
                  <span
                    key={i}
                    className={`rounded-full px-2.5 py-1 text-sm font-medium ${
                      ch.kind === "slot"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-white text-slate-700 ring-1 ring-slate-200"
                    }`}
                  >
                    {ch.text}
                  </span>
                ))}
              </div>
              <Text type="secondary" className="mt-2 block text-xs">
                Câu lưu xuống: <strong>{previewSentence}</strong>
              </Text>
              {draftChunks.length === 1 && (
                <Text type="warning" className="mt-1 block text-xs">
                  Chỉ có một mẩu — bài ghép câu sẽ không có gì để xếp. Cân nhắc
                  chia nhỏ hơn.
                </Text>
              )}
            </div>
          )}

          <div>
            <Text className="mb-1 block font-medium">Ngữ cảnh dùng được</Text>
            <Select
              mode="multiple"
              value={contexts}
              onChange={setContexts}
              size="large"
              className="w-full rounded-xl"
              placeholder="Chọn một hoặc nhiều"
              options={CONTEXT_OPTIONS}
            />
            <Text type="secondary" className="mt-1 block text-xs">
              Chọn được NHIỀU — một câu thường dùng lại được ở nhiều tình huống.
            </Text>
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
