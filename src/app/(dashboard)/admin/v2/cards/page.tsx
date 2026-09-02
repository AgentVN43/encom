"use client";

import { useEffect, useMemo, useState } from "react";
import { useAdminGuard } from "@/lib/useAdminGuard";
import {
  createV2Card,
  createV2CardsWithChunks,
  deleteV2Card,
  getCardCategories,
  getV2CardCounts,
  getV2Cards,
  getV2Categories,
  getSubstitutionFillers,
  getV2Chunks,
  getV2Topics,
  replaceAllFillers,
  replaceChunks,
  setCardCategories,
  updateV2Card,
  type DraftFiller,
  type V2Category,
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
import { REGISTER_LABEL, REGISTER_ORDER } from "@/lib/v2/types";
import type { V2Card, V2Chunk, V2Register } from "@/lib/v2/types";
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

/** Giữ đúng thứ tự trang trọng → thân mật, đừng sắp xếp lại theo bảng chữ cái */
const REGISTER_OPTIONS = REGISTER_ORDER.map((value) => ({
  value,
  label: REGISTER_LABEL[value],
}));

/** Màu huy hiệu theo mức — dùng chung cho danh sách và xem trước khi nhập */
const REGISTER_CHIP: Record<V2Register, string> = {
  formal: "bg-indigo-50 text-indigo-700",
  neutral: "bg-slate-100 text-slate-600",
  informal: "bg-emerald-50 text-emerald-700",
};

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
  /** Chủ đề của riêng thẻ đang sửa — tách khỏi ô lọc để đổi được chức năng */
  const [formTopicId, setFormTopicId] = useState("");
  const [register, setRegister] = useState<V2Register>("neutral");
  const [cardCategories, setCardCategoriesState] = useState<string[]>([]);
  /**
   * Cụm thay thế cho từng mẩu `slot`, khoá theo VỊ TRÍ slot (0 = slot đầu).
   * Không khoá theo id chunk vì id đổi mỗi lần lưu — xem `replaceAllFillers`.
   */
  const [fillers, setFillers] = useState<DraftFiller[][]>([]);
  const [position, setPosition] = useState(0);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<V2Category[]>([]);
  const [catByCard, setCatByCard] = useState<Record<string, string[]>>({});

  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [importCategories, setImportCategories] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);

  /** Phân tích lại mỗi lần gõ — admin thấy lỗi ngay thay vì sau khi bấm Nhập */
  const parsed = useMemo(
    () => parseV2ImportText(importText, topics, topicId),
    [importText, topics, topicId]
  );
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
  /** Mẩu thay được của câu đang soạn — mỗi mẩu là một ô nhập cụm thay thế */
  const draftSlots = useMemo(
    () => draftChunks.filter((c) => c.kind === "slot"),
    [draftChunks]
  );

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      try {
        const [tops, cats] = await Promise.all([
          getV2Topics(),
          getV2Categories().catch(() => [] as V2Category[]),
        ]);
        setTopics(tops);
        setCategories(cats);
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
      const ids = rows.map((c) => c.id);
      const [chunks, cats] = await Promise.all([
        getV2Chunks(ids),
        getCardCategories(ids).catch(() => ({})),
      ]);
      const grouped: Record<string, V2Chunk[]> = {};
      for (const ch of chunks) (grouped[ch.card_id] ??= []).push(ch);
      setChunksByCard(grouped);
      setCatByCard(cats);
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

        const ids = rows.map((c) => c.id);
        const [chunks, cats] = await Promise.all([
          getV2Chunks(ids),
          getCardCategories(ids).catch(() => ({})),
        ]);
        if (cancelled) return;
        const grouped: Record<string, V2Chunk[]> = {};
        for (const ch of chunks) (grouped[ch.card_id] ??= []).push(ch);
        setChunksByCard(grouped);
        setCatByCard(cats);
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
    setFormTopicId(topicId);
    setRegister("neutral");
    setCardCategoriesState([]);
    setFillers([]);
    setPosition(cards.length);
    setDrawerOpen(true);
  };

  const openEdit = async (card: V2Card) => {
    setEditing(card);
    setVietnamese(card.vietnamese_text);
    // Dựng lại dòng có ngoặc từ mẩu đã lưu; thẻ chưa chia mẩu thì lấy câu gốc
    const existing = chunksByCard[card.id] ?? [];
    setEnglishLine(
      existing.length > 0 ? formatChunks(existing) : card.english_text
    );
    setFormTopicId(card.topic_id);
    setRegister(card.register);
    setCardCategoriesState(catByCard[card.id] ?? []);
    setPosition(card.position);
    setFillers([]);
    setDrawerOpen(true);

    // Nạp cụm thay thế sau khi mở drawer: chậm hơn một nhịp nhưng không chặn
    // người soạn nhìn thấy phần còn lại của thẻ
    const slots = existing
      .filter((c) => c.kind === "slot")
      .sort((a, b) => a.position - b.position);
    if (slots.length === 0) return;
    try {
      const rows = await getSubstitutionFillers(slots.map((c) => c.id));
      // Gom theo VỊ TRÍ slot, khớp với cách `replaceAllFillers` ghi xuống
      setFillers(
        slots.map((slot) =>
          rows
            .filter((r) => r.slot_chunk_id === slot.id)
            .sort((a, b) => a.position - b.position)
            .map((r) => ({ filler_text: r.filler_text, filler_vi: r.filler_vi }))
        )
      );
    } catch {
      // Chưa chạy migration filler thì coi như chưa có cụm nào
    }
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
    if (!formTopicId) {
      message.error("Vui lòng chọn chức năng giao tiếp");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        topic_id: formTopicId,
        vietnamese_text: vietnamese.trim(),
        // Câu hoàn chỉnh suy từ mẩu, không bắt gõ hai lần — gõ hai lần là hai
        // bản dễ lệch, mà lệch thì bài ôn chấm một đằng hiện một nẻo
        english_text: previewSentence,
        register,
        position,
      };

      // Ghi thẻ trước rồi mới ghi mẩu và lĩnh vực: cả hai đều cần card_id, và
      // nếu bước sau hỏng thì thẻ vẫn còn đó để sửa lại, không mất công gõ
      const cardId = editing
        ? (await updateV2Card(editing.id, payload), editing.id)
        : (await createV2Card(payload)).id;

      const savedChunks = await replaceChunks(cardId, draftChunks);
      await setCardCategories(cardId, cardCategories);
      // Ghi lại cụm thay thế SAU khi chunk mới đã có id — chunk cũ vừa bị xoá
      // nên cụm cũ cũng mất theo (khoá ngoại CASCADE)
      await replaceAllFillers(savedChunks, fillers);

      message.success(editing ? "Đã cập nhật thẻ" : "Đã tạo thẻ mới");
      setDrawerOpen(false);
      // Chuyển ô lọc sang chủ đề vừa lưu, nếu không thẻ biến mất khỏi danh
      // sách và người soạn tưởng lưu hỏng
      if (formTopicId !== topicId) setTopicId(formTopicId);
      else loadCards(topicId);
    } catch (err: unknown) {
      message.error(
        "Lỗi: " + (err instanceof Error ? err.message : "Lỗi không xác định")
      );
    } finally {
      setSaving(false);
    }
  };

  const handleImport = async () => {
    if (parsed.valid.length === 0) {
      message.error("Chưa có dòng nào hợp lệ để nhập");
      return;
    }
    setImporting(true);
    try {
      // Một lần dán có thể trải nhiều chủ đề nhờ dòng tiêu đề '#', nên gom
      // theo chủ đề rồi ghi từng nhóm
      const byTopic = new Map<string, typeof parsed.valid>();
      for (const row of parsed.valid) {
        const list = byTopic.get(row.topic_id) ?? [];
        list.push(row);
        byTopic.set(row.topic_id, list);
      }

      // Vị trí phải nối tiếp số thẻ ĐANG CÓ của từng chủ đề, không phải của
      // chủ đề đang mở — nhập vào chủ đề khác mà bắt đầu từ 0 là đè số thứ tự
      // của thẻ cũ
      const counts = await getV2CardCounts().catch(
        () => ({}) as Record<string, number>
      );

      let total = 0;
      for (const [tid, rows] of byTopic) {
        total += await createV2CardsWithChunks(
          tid,
          rows.map((r) => ({
            vietnamese_text: r.vietnamese_text,
            english_text: r.english_text,
            register: r.register,
            chunks: r.chunks,
          })),
          counts[tid] ?? 0,
          importCategories
        );
      }

      message.success(
        byTopic.size > 1
          ? `Đã nhập ${total} câu vào ${byTopic.size} chức năng`
          : `Đã nhập ${total} câu`
      );
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

                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${REGISTER_CHIP[card.register]}`}
                        >
                          {REGISTER_LABEL[card.register]}
                        </span>
                        {(catByCard[card.id] ?? []).map((id) => (
                          <span
                            key={id}
                            className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700"
                          >
                            {categories.find((c) => c.id === id)?.name ?? "?"}
                          </span>
                        ))}
                        {(catByCard[card.id] ?? []).length === 0 && (
                          <span className="text-xs text-amber-700">
                            Chưa gắn lĩnh vực
                          </span>
                        )}
                      </div>
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
              Chủ đề mặc định (cho dòng trước tiêu đề &ldquo;#&rdquo; đầu tiên):{" "}
              <strong>{topics.find((t) => t.id === topicId)?.name ?? "—"}</strong>
            </Text>
          </div>

          <div>
            <FieldLabel
              label="Lĩnh vực cho cả loạt"
              hint="Gán cho MỌI câu trong lần nhập này. Lĩnh vực không nằm trong dòng nhập vì một loạt gần như luôn cùng lĩnh vực; câu nào khác thì sửa lại sau trong danh sách."
            />
            <Select
              mode="multiple"
              value={importCategories}
              onChange={setImportCategories}
              size="large"
              className="w-full rounded-xl"
              placeholder="Chọn một hoặc nhiều"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
            />
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
                        {r.vietnamese_text} · {REGISTER_LABEL[r.register]} ·{" "}
                        {topics.find((t) => t.id === r.topic_id)?.name ?? "?"}
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
              label="Chức năng giao tiếp"
              hint="Câu này dùng để LÀM GÌ. Phép thử: tên chủ đề phải điền được vào 'Tôi muốn ___' — 'Tôi muốn xin lỗi' đúng, 'Tôi muốn cuộc họp' sai vì đó là tình huống chứ không phải hành động. Đổi ở đây là chuyển thẻ sang chủ đề khác."
            />
            <Select
              value={formTopicId || undefined}
              onChange={setFormTopicId}
              size="large"
              className="w-full rounded-xl"
              placeholder="Chọn chức năng"
              showSearch
              optionFilterProp="label"
              options={topics.map((t) => ({ value: t.id, label: t.name }))}
            />
          </div>

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

          {/* Cụm thay thế — chỉ hiện khi câu có mẩu thay được, vì không có
              slot thì bài Rèn luyện không ra được đề */}
          {draftSlots.length > 0 && (
            <div>
              <FieldLabel
                label="Cụm thay thế (bài Rèn luyện)"
                hint="Giữ nguyên khung câu, đổi phần trong ngoặc sang tình huống khác. Mỗi cụm cần cả tiếng Anh lẫn nghĩa tiếng Việt — đề bài nêu tình huống bằng tiếng Việt rồi hỏi dùng cụm nào, thiếu nghĩa thì không ra được đề. Bỏ trống cũng được, chỉ là câu đó không xuất hiện trong bài Rèn luyện."
              />
              <div className="space-y-3">
                {draftSlots.map((slot, slotIndex) => (
                  <FillerEditor
                    key={slotIndex}
                    slotText={slot.text}
                    rows={fillers[slotIndex] ?? []}
                    onChange={(next) =>
                      setFillers((prev) => {
                        const copy = [...prev];
                        // Lấp chỗ trống cho các slot đứng trước chưa nhập gì
                        while (copy.length <= slotIndex) copy.push([]);
                        copy[slotIndex] = next;
                        return copy;
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <div>
            <FieldLabel
              label="Mức trang trọng"
              hint="Chọn MỘT. Đây là thứ quyết định câu dùng được với ai — nói 'Got a sec?' với giám đốc là lỗi điển hình. Cùng một chức năng nên soạn đủ ba mức để người học thấy cả thang."
            />
            <Select
              value={register}
              onChange={setRegister}
              size="large"
              className="w-full rounded-xl"
              options={REGISTER_OPTIONS}
            />
          </div>

          <div>
            <FieldLabel
              label="Lĩnh vực"
              hint="Chọn được NHIỀU. Một câu như 'Can we schedule a call?' vừa dùng ở Work vừa dùng ở Social — gắn đủ thì người học mới nhận ra nó dùng lại được, thay vì tưởng chỉ hợp một hoàn cảnh."
            />
            <Select
              mode="multiple"
              value={cardCategories}
              onChange={setCardCategoriesState}
              size="large"
              className="w-full rounded-xl"
              placeholder="Chọn một hoặc nhiều"
              options={categories.map((c) => ({ value: c.id, label: c.name }))}
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

/**
 * Ô nhập cụm thay thế cho MỘT mẩu `slot`.
 *
 * Mỗi cụm hai ô: tiếng Anh và nghĩa tiếng Việt. Cần cả hai vì bài Rèn luyện
 * nêu tình huống bằng tiếng Việt rồi hỏi dùng cụm tiếng Anh nào — chỉ có tiếng
 * Anh thì mọi cụm đều đúng như nhau và không ra được đề.
 */
function FillerEditor({
  slotText,
  rows,
  onChange,
}: {
  slotText: string;
  rows: DraftFiller[];
  onChange: (next: DraftFiller[]) => void;
}) {
  const update = (i: number, patch: Partial<DraftFiller>) =>
    onChange(rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <Text className="block text-sm font-medium">
        Thay cho{" "}
        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
          {slotText}
        </span>
      </Text>

      <div className="mt-2 space-y-2">
        {rows.map((row, i) => (
          <div key={i} className="flex items-start gap-2">
            <Input
              value={row.filler_text}
              onChange={(e) => update(i, { filler_text: e.target.value })}
              placeholder="a quick chat"
              className="rounded-lg font-mono"
            />
            <Input
              value={row.filler_vi}
              onChange={(e) => update(i, { filler_vi: e.target.value })}
              placeholder="một buổi trao đổi nhanh"
              className="rounded-lg"
            />
            <Button
              type="text"
              danger
              icon={<Trash2 size={16} />}
              onClick={() => onChange(rows.filter((_, idx) => idx !== i))}
              className="min-h-[40px] min-w-[40px] shrink-0"
            />
          </div>
        ))}
      </div>

      <div className="mt-2 flex gap-2">
        <Button
          type="dashed"
          icon={<Plus size={16} />}
          onClick={() => onChange([...rows, { filler_text: "", filler_vi: "" }])}
          className="flex-1 rounded-lg"
        >
          Thêm cụm
        </Button>
        {/* Cụm gốc phải nằm trong danh sách, nếu không người học luyện toàn
            cụm mới và không bao giờ gặp lại câu đã học */}
        {!rows.some((r) => r.filler_text.trim() === slotText.trim()) && (
          <Button
            type="dashed"
            onClick={() =>
              onChange([
                { filler_text: slotText, filler_vi: "" },
                ...rows,
              ])
            }
            className="rounded-lg"
          >
            + Cụm gốc
          </Button>
        )}
      </div>

      {rows.length === 1 && (
        <Text type="warning" className="mt-1 block text-xs">
          Chỉ một cụm thì không có gì để chọn — cần ít nhất hai.
        </Text>
      )}
    </div>
  );
}
