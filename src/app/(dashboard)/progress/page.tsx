"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getProgress, getStudySessions } from "@/lib/db";
import { getV2ProgressDetail, type V2ProgressDetail } from "@/lib/v2/db";
import { isDue } from "@/lib/v2/srs";
import { message } from "antd";
import { Check, ChevronDown, ChevronRight, X } from "lucide-react";
import { Screen, Loader, EmptyState } from "@/components/ui/Layout";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import StudyHistory from "@/components/StudyHistory";
import { isMastered } from "@/lib/constants";
import type { StudySession } from "@/lib/types";

interface ProgressItem {
  id: string;
  card_id: string;
  correct_count: number;
  wrong_count: number;
  streak: number;
  status: "learning" | "mastered";
  cards: {
    word: string;
    meaning_vi: string;
    topic_id: string;
    topics: { id: string; name: string };
  };
}

interface TopicGroup {
  topicId: string;
  topicName: string;
  items: ProgressItem[];
}

type TabKey = "sessions" | "words" | "sentences";

export default function ProgressPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<ProgressItem[]>([]);
  const [sessions, setSessions] = useState<StudySession[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [tab, setTab] = useState<TabKey>("sessions");
  const [v2Progress, setV2Progress] = useState<V2ProgressDetail[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace("/login?redirect=%2Fprogress");
        return;
      }
      setUserId(session.user.id);
    });
  }, [router]);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        // Bảng study_sessions có thể chưa được tạo (chưa chạy migration) —
        // không được vì thế mà mất luôn phần tiến độ từ vựng
        const [data, sessionRows, v2Rows] = await Promise.all([
          getProgress(userId),
          getStudySessions(userId).catch(() => [] as StudySession[]),
          // Chưa chạy migration v2 thì phần này rỗng, không được kéo sập cả trang
          getV2ProgressDetail(userId).catch(() => [] as V2ProgressDetail[]),
        ]);
        setProgress(data as ProgressItem[]);
        setSessions(sessionRows);
        setV2Progress(v2Rows);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Lỗi không xác định";
        message.error("Lỗi tải dữ liệu: " + msg);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const grouped: TopicGroup[] = Object.values(
    progress.reduce(
      (acc, item) => {
        const tId = item.cards?.topics?.id || "unknown";
        const tName = item.cards?.topics?.name || "Không có chủ đề";
        if (!acc[tId]) acc[tId] = { topicId: tId, topicName: tName, items: [] };
        acc[tId].items.push(item);
        return acc;
      },
      {} as Record<string, TopicGroup>
    )
  );

  if (loading) return <Loader />;

  return (
    <Screen className="py-4">
      <h1 className="text-2xl text-ink">Tiến độ học tập</h1>
      <p className="mt-1 font-bold text-ink-soft">
        Thời gian vào học và kết quả từng chủ đề
      </p>

      {/* Chuyển tab dạng viên thuốc — to, dễ bấm bằng ngón cái */}
      <div
        role="tablist"
        aria-label="Chế độ xem tiến độ"
        className="mt-4 flex gap-1 rounded-pill bg-cloud-deep p-1"
      >
        {(
          [
            { key: "sessions", label: "Buổi học" },
            { key: "words", label: "Từ vựng" },
            { key: "sentences", label: "Câu" },
          ] as const
        ).map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-pill py-2.5 font-display font-extrabold transition-colors ${
              tab === t.key ? "bg-white text-grape shadow-sm" : "text-ink-soft"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-5">
        {tab === "sessions" ? (
          <StudyHistory sessions={sessions} />
        ) : tab === "sentences" ? (
          <SentenceProgress rows={v2Progress} />
        ) : progress.length === 0 ? (
          <EmptyState
            emoji="🌱"
            title="Chưa học từ nào"
            hint="Chọn một chủ đề ở trang chủ để bắt đầu nhé!"
          />
        ) : (
          <div className="space-y-3">
            {grouped.map((group) => {
              const isOpen = expanded[group.topicId] ?? false;
              const masteredCount = group.items.filter((i) =>
                isMastered(i.streak)
              ).length;
              const pct = (masteredCount / group.items.length) * 100;

              return (
                <Card key={group.topicId} className="overflow-hidden">
                  <button
                    onClick={() =>
                      setExpanded((p) => ({
                        ...p,
                        [group.topicId]: !p[group.topicId],
                      }))
                    }
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 p-4 text-left"
                  >
                    <span className="shrink-0 text-ink-faint">
                      {isOpen ? (
                        <ChevronDown size={20} strokeWidth={2.5} />
                      ) : (
                        <ChevronRight size={20} strokeWidth={2.5} />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-base font-extrabold text-ink">
                        {group.topicName}
                      </p>
                      <p className="text-sm font-bold text-ink-soft">
                        Đã thuộc {masteredCount}/{group.items.length} từ
                      </p>
                      <ProgressBar
                        percent={pct}
                        tone="leaf"
                        className="mt-1.5 h-2"
                        label={`${group.topicName}: ${masteredCount} trên ${group.items.length} từ`}
                      />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t-2 border-cloud-deep">
                      {group.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-center gap-3 border-b border-cloud px-4 py-3 last:border-b-0"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-display text-base font-extrabold text-ink">
                              {item.cards?.word || "—"}
                            </p>
                            <p className="truncate text-sm text-ink-soft">
                              {item.cards?.meaning_vi || ""}
                            </p>
                          </div>

                          <div className="flex shrink-0 items-center gap-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-leaf-soft px-2 py-1 text-sm font-extrabold text-leaf-dark">
                              <Check size={13} strokeWidth={3} />
                              {item.correct_count}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded-full bg-cherry-soft px-2 py-1 text-sm font-extrabold text-cherry-dark">
                              <X size={13} strokeWidth={3} />
                              {item.wrong_count}
                            </span>
                            {isMastered(item.streak) && (
                              <span className="text-xl" title="Đã thuộc">
                                ⭐
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </Screen>
  );
}

/**
 * Tiến độ phần học theo câu (v2).
 *
 * Không dùng lại khối "Từ vựng" ở trên vì hai bên đo bằng thước khác nhau:
 * v1 có khái niệm "đã thuộc" (chuỗi đúng đạt ngưỡng), còn v2 dùng FSRS nên
 * không có mốc thuộc/chưa thuộc — chỉ có ĐẾN HẠN hay chưa, và lịch ôn kế
 * tiếp. Ép chung một cách hiển thị là nói sai về cả hai.
 */
function SentenceProgress({ rows }: { rows: V2ProgressDetail[] }) {
  if (rows.length === 0) {
    return (
      <EmptyState
        emoji="🌱"
        title="Chưa học câu nào"
        hint="Chọn một chức năng giao tiếp ở trang chủ để bắt đầu nhé!"
      />
    );
  }

  const now = new Date();
  const groups = new Map<
    string,
    { name: string; items: V2ProgressDetail[] }
  >();
  for (const row of rows) {
    const id = row.v2_cards?.topic_id ?? "khac";
    const name = row.v2_cards?.v2_topics?.name ?? "Chủ đề đã xoá";
    const g = groups.get(id) ?? { name, items: [] };
    g.items.push(row);
    groups.set(id, g);
  }

  const dueTotal = rows.filter((r) => isDue(r, now)).length;

  return (
    <div className="space-y-3">
      <Card className="flex items-center gap-4 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-extrabold text-ink">
            Đang theo dõi {rows.length} câu
          </p>
          <p className="text-sm font-bold text-ink-soft">
            {dueTotal > 0
              ? `${dueTotal} câu đã đến hạn ôn`
              : "Chưa câu nào đến hạn — quay lại sau nhé"}
          </p>
        </div>
      </Card>

      {[...groups.entries()].map(([id, group]) => {
        const due = group.items.filter((r) => isDue(r, now)).length;
        return (
          <Card key={id} className="p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate font-display text-base font-extrabold text-ink">
                {group.name}
              </p>
              <span className="shrink-0 text-sm font-bold text-ink-soft tabular-nums">
                {group.items.length} câu
              </span>
            </div>

            {due > 0 && (
              <p className="mt-0.5 text-sm font-bold text-grape-dark">
                {due} câu đến hạn
              </p>
            )}

            <div className="mt-3 space-y-2">
              {group.items.map((row) => {
                const overdue = isDue(row, now);
                return (
                  <div
                    key={row.card_id}
                    className="flex items-center gap-3 border-b border-cloud pb-2 last:border-b-0 last:pb-0"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-ink">
                        {row.v2_cards?.english_text || "—"}
                      </p>
                      <p className="truncate text-xs text-ink-soft">
                        {row.v2_cards?.vietnamese_text || ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {/* Số lần quên đáng chú ý hơn số lần đúng: nó chỉ ra câu
                          nào đang khó với riêng người này */}
                      {row.fsrs_lapses > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-cherry-soft px-2 py-0.5 text-xs font-extrabold text-cherry-dark">
                          <X size={12} strokeWidth={3} />
                          {row.fsrs_lapses}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${
                          overdue
                            ? "bg-grape-soft text-grape-dark"
                            : "bg-cloud-deep text-ink-soft"
                        }`}
                      >
                        {overdue ? "Đến hạn" : formatDue(row.fsrs_due)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/** "còn 3 ngày" — người học cần biết khoảng cách, không cần ngày giờ chính xác */
function formatDue(due: string | null): string {
  if (!due) return "—";
  const t = Date.parse(due);
  if (Number.isNaN(t)) return "—";
  const days = Math.ceil((t - Date.now()) / 86_400_000);
  if (days <= 0) return "Hôm nay";
  if (days === 1) return "Mai";
  if (days < 30) return `${days} ngày`;
  return `${Math.round(days / 30)} tháng`;
}
