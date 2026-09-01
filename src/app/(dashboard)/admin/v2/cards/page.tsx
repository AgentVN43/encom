"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";
import {
  createV2Card,
  createV2CardsWithChunks,
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
import {
  IMPORT_HINT,
  IMPORT_PLACEHOLDER,
  parseV2ImportText,
} from "@/lib/v2/import-cards";
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
import {
  Plus,
  Edit2,
  Trash2,
  MessageSquareText,
  Upload,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import { Screen } from "@/components/ui/Layout";
import FieldLabel from "@/components/admin/FieldLabel";

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

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importing, setImporting] = useState(false);

  /** Phân tích lại mỗi lần gõ — admin thấy lỗi ngay thay vì sau khi bấm Nhập */
  const parsed = useMemo(() => parseV2ImportText(importText), [importText]);
  const warned = useMemo(
    () => parsed.valid.filter((r) => r.warning),
    [parsed]
  );

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

  const handleImport = async () => {
    if (!topicId) {
      message.error("Chọn chủ đề trước khi nhập");
      return;
    }
    if (parsed.valid.length === 0) {
      message.error("Chưa có dòng nào hợp lệ để nhập");
      return;
    }
    setImporting(true);
    try {
      const count = await createV2CardsWithChunks(
        topicId,
        parsed.valid.map((r) => ({
          vietnamese_text: r.vietnamese_text,
          english_text: r.english_text,
          context_tags: r.context_tags,
          chunks: r.chunks,
        })),
        // Nối tiếp sau thẻ đang có để không đụng số thứ tự của thẻ cũ
        cards.length
      );
      message.success(`Đã nhập ${count} câu`);
      setImportOpen(false);
      setImportText("");
      loadCards(topicId);
    } catch (err: unknown) {
      message.error(
        "Lỗi nhập câu: " +
          (err instanceof Error ? err.message : "Lỗi không xác định")
      );
    } finally {
      setImporting(false);
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
        <div className="flex shrink-0 gap-2">
          <Button
            icon={<Upload size={18} />}
            onClick={() => {
              setImportText("");
              setImportOpen(true);
            }}
            disabled={!topicId}
            className="min-h-[44px] rounded-xl"
          >
            Nhập
          </Button>
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

      {/* Nhập hàng loạt */}
      <Drawer
        title="Nhập câu hàng loạt"
        placement="bottom"
        onClose={() => setImportOpen(false)}
        open={importOpen}
        rootClassName="bottom-sheet"
        styles={{ wrapper: { height: "auto" } }}
        extra={
          <Button
            type="primary"
            loading={importing}
            disabled={parsed.valid.length === 0}
            onClick={handleImport}
            className="rounded-xl"
          >
            Nhập {parsed.valid.length > 0 ? `${parsed.valid.length} câu` : ""}
          </Button>
        }
      >
        <div className="drawer-handle" />
        <div className="mx-auto max-w-lg space-y-4">
          <div>
            <FieldLabel
              label="Danh sách câu"
              hint={
                <>
                  Mỗi dòng một câu, ba cột ngăn bằng dấu gạch ngang có khoảng
                  trắng hai bên:
                  <br />
                  <br />
                  câu tiếng Anh - câu tiếng Việt - ngữ cảnh
                  <br />
                  <br />
                  Cột ngữ cảnh không bắt buộc, nhận cả tên tiếng Anh
                  (meeting, email, call, chat) lẫn tiếng Việt (họp, email, gọi,
                  nhắn tin), ngăn nhau bằng dấu phẩy.
                  <br />
                  <br />
                  Câu tiếng Việt chứa dấu gạch ngang vẫn an toàn — chỉ cột cuối
                  toàn tên ngữ cảnh hợp lệ mới bị tách ra.
                </>
              }
            />
            <Text type="secondary" className="mb-2 block text-sm">
              {IMPORT_HINT}
            </Text>
            <Input.TextArea
              value={importText}
              onChange={(e) => setImportText(e.target.value)}
              placeholder={IMPORT_PLACEHOLDER}
              autoSize={{ minRows: 6, maxRows: 14 }}
              className="rounded-xl font-mono text-sm"
            />
            <Text type="secondary" className="mt-1 block text-xs">
              Nhập vào chủ đề: <strong>
                {topics.find((t) => t.id === topicId)?.name ?? "—"}
              </strong>
            </Text>
          </div>

          {parsed.rows.length > 0 && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <Text className="block text-sm">
                <span className="font-medium text-green-600">
                  {parsed.valid.length} dòng hợp lệ
                </span>
                {parsed.invalid.length > 0 && (
                  <span className="text-red-500">
                    {" · "}
                    {parsed.invalid.length} dòng lỗi
                  </span>
                )}
              </Text>

              {parsed.invalid.length > 0 && (
                <div className="space-y-1">
                  {parsed.invalid.slice(0, 5).map((r) => (
                    <div
                      key={r.line}
                      className="flex items-start gap-2 text-xs text-red-600"
                    >
                      <AlertCircle size={14} className="mt-0.5 shrink-0" />
                      <span>
                        Dòng {r.line}: {r.error} — &ldquo;{r.raw}&rdquo;
                      </span>
                    </div>
                  ))}
                  {parsed.invalid.length > 5 && (
                    <Text type="secondary" className="text-xs">
                      ...và {parsed.invalid.length - 5} dòng lỗi khác
                    </Text>
                  )}
                </div>
              )}

              {/* Cảnh báo khác lỗi: dòng vẫn nhập được, chỉ là đáng ngờ */}
              {warned.length > 0 && (
                <div className="space-y-1">
                  {warned.slice(0, 5).map((r) => (
                    <div
                      key={r.line}
                      className="flex items-start gap-2 text-xs text-amber-700"
                    >
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      <span>
                        Dòng {r.line}: {r.warning}
                      </span>
                    </div>
                  ))}
                  {warned.length > 5 && (
                    <Text type="secondary" className="text-xs">
                      ...và {warned.length - 5} dòng cần xem lại
                    </Text>
                  )}
                </div>
              )}

              {parsed.valid.length > 0 && (
                <div className="space-y-2 pt-1">
                  <Text type="secondary" className="text-xs">
                    Xem trước cách chia mẩu:
                  </Text>
                  {parsed.valid.slice(0, 3).map((r) => (
                    <div key={r.line} className="rounded-lg bg-white p-2">
                      <div className="flex flex-wrap gap-1">
                        {r.chunks.map((ch, i) => (
                          <span
                            key={i}
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              ch.kind === "slot"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-slate-100 text-slate-700"
                            }`}
                          >
                            {ch.text}
                          </span>
                        ))}
                      </div>
                      <Text type="secondary" className="mt-1 block text-xs">
                        {r.vietnamese_text}
                        {r.context_tags.length > 0 &&
                          ` · ${r.context_tags
                            .map(
                              (t) =>
                                CONTEXT_OPTIONS.find((o) => o.value === t)
                                  ?.label ?? t
                            )
                            .join(", ")}`}
                      </Text>
                    </div>
                  ))}
                  {parsed.valid.length > 3 && (
                    <Text type="secondary" className="text-xs">
                      ...và {parsed.valid.length - 3} câu nữa
                    </Text>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </Drawer>

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
            <FieldLabel
              label="Câu tiếng Việt"
              hint="Mặt trước thẻ. Người học đọc câu này rồi tự nghĩ ra câu tiếng Anh trước khi lật."
            />
            <Input.TextArea
              value={vietnamese}
              onChange={(e) => setVietnamese(e.target.value)}
              placeholder="VD: Mình sắp xếp một cuộc gọi tuần sau nhé?"
              autoSize={{ minRows: 2, maxRows: 4 }}
              size="large"
              className="rounded-xl"
            />
          </div>

          <div>
            <FieldLabel
              label="Câu tiếng Anh"
              hint={
                <>
                  Đặt trong ngoặc vuông phần ĐỔI ĐƯỢC sang tình huống khác,
                  phần ngoài ngoặc là khung cố định.
                  <br />
                  <br />
                  Ví dụ: Can we schedule [a call] next week?
                  <br />
                  <br />
                  Người học sẽ phải ghép lại đúng thứ tự các mẩu này, nên chia
                  càng sát nghĩa càng tốt.
                </>
              }
            />
            <Input.TextArea
              value={englishLine}
              onChange={(e) => setEnglishLine(e.target.value)}
              placeholder="Can we schedule [a call] [next week]?"
              autoSize={{ minRows: 2, maxRows: 4 }}
              size="large"
              className="rounded-xl font-mono"
            />
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
            <FieldLabel
              label="Ngữ cảnh dùng được"
              hint="Chọn được NHIỀU. Một câu thường dùng lại được ở nhiều tình huống — gắn đủ thì người học mới nhận ra điều đó thay vì tưởng câu chỉ hợp một chỗ."
            />
            <Select
              mode="multiple"
              value={contexts}
              onChange={setContexts}
              size="large"
              className="w-full rounded-xl"
              placeholder="Chọn một hoặc nhiều"
              options={CONTEXT_OPTIONS}
            />
          </div>

          <div>
            <FieldLabel
              label="Thứ tự hiển thị"
              hint="Số nhỏ hiện trước trong danh sách thẻ của chủ đề."
            />
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
