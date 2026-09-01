"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getNewCards,
  getV2Chunks,
  getV2Topic,
  markUnderstood,
  type V2Topic,
} from "@/lib/v2/db";
import type { V2Card, V2Chunk, V2Context } from "@/lib/v2/types";
import { Screen, Loader, EmptyState } from "@/components/ui/Layout";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import { ArrowLeft, Eye, Volume2 } from "lucide-react";
import { cancelSpeech, speakText } from "@/lib/utils";

/** Số câu mới mỗi lượt — học dồn quá nhiều thì ôn tập hôm sau vỡ trận */
const NEW_CARDS_PER_ROUND = 8;

const CONTEXT_LABEL: Record<V2Context, string> = {
  meeting: "Họp",
  email: "Email",
  call: "Điện thoại",
  chat: "Nhắn tin",
};

export default function V2LearnPage() {
  const { topicId } = useParams<{ topicId: string }>();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [topic, setTopic] = useState<V2Topic | null>(null);
  const [cards, setCards] = useState<V2Card[]>([]);
  const [chunksByCard, setChunksByCard] = useState<Record<string, V2Chunk[]>>({});

  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => cancelSpeech, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace(
          `/login?redirect=${encodeURIComponent(`/v2/learn/${topicId}`)}`
        );
        return;
      }
      if (cancelled) return;
      setUserId(session.user.id);

      try {
        const [topicRow, newCards] = await Promise.all([
          getV2Topic(topicId).catch(() => null),
          getNewCards(session.user.id, topicId, NEW_CARDS_PER_ROUND),
        ]);
        if (cancelled) return;

        setTopic(topicRow);
        setCards(newCards);

        // Lấy mẩu của cả lượt trong một request thay vì gọi lẻ từng thẻ
        const chunks = await getV2Chunks(newCards.map((c) => c.id)).catch(
          () => [] as V2Chunk[]
        );
        if (cancelled) return;

        const grouped: Record<string, V2Chunk[]> = {};
        for (const ch of chunks) (grouped[ch.card_id] ??= []).push(ch);
        setChunksByCard(grouped);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Không tải được bài học");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router, topicId]);

  const current = cards[index];

  const speak = useCallback((text: string) => {
    speakText(text, "en-US");
  }, []);

  /** Bấm "Đã hiểu" — không chấm điểm, chỉ đưa thẻ vào hàng chờ ôn tập */
  const handleUnderstood = async () => {
    if (!userId || !current || saving) return;
    setSaving(true);
    try {
      await markUnderstood(userId, current.id);
    } catch {
      // Không chặn việc học vì một lần ghi hỏng — người học vẫn đi tiếp được,
      // thẻ chỉ đơn giản chưa vào lịch ôn và sẽ hiện lại ở lượt học mới sau
    } finally {
      setSaving(false);
    }

    cancelSpeech();
    if (index < cards.length - 1) {
      setIndex((i) => i + 1);
      setRevealed(false);
    } else {
      setDone(true);
    }
  };

  if (loading) return <Loader label="Đang chuẩn bị bài học..." />;

  if (error) {
    return (
      <Screen width="narrow" className="py-10">
        <EmptyState
          emoji="😕"
          title="Không tải được bài học"
          hint={error}
          action={
            <Button className="mt-2" onClick={() => router.push("/home")}>
              Quay lại
            </Button>
          }
        />
      </Screen>
    );
  }

  if (cards.length === 0) {
    return (
      <Screen width="narrow" className="py-10">
        <EmptyState
          emoji="✅"
          title="Đã học hết chủ đề này"
          hint="Mọi câu ở đây đều đã vào lịch ôn tập. Quay lại trang chủ để ôn hoặc chọn chủ đề khác."
          action={
            <Button className="mt-2" onClick={() => router.push("/home")}>
              Về trang chủ
            </Button>
          }
        />
      </Screen>
    );
  }

  if (done) {
    return (
      <Screen width="narrow" className="py-10">
        <EmptyState
          emoji="🎯"
          title={`Đã học ${cards.length} câu mới`}
          hint="Những câu này sẽ xuất hiện trong phần ôn tập theo lịch giãn cách."
          action={
            <div className="mt-2 flex flex-col gap-3">
              <Button onClick={() => router.push("/v2/review")}>
                Ôn tập ngay
              </Button>
              <Button tone="plain" onClick={() => router.push("/home")}>
                Về trang chủ
              </Button>
            </div>
          }
        />
      </Screen>
    );
  }

  if (!current) return null;

  const chunks = chunksByCard[current.id] ?? [];
  const percent = ((index + 1) / cards.length) * 100;

  return (
    <div className="dotted-bg min-h-dvh pb-32">
      <Screen width="narrow" className="py-4">
        <div className="flex items-center gap-3">
          <IconButton
            icon={<ArrowLeft size={20} strokeWidth={2.5} />}
            label="Quay lại trang chủ"
            onClick={() => router.push("/home")}
          />
          <ProgressBar
            percent={percent}
            tone="grape"
            className="flex-1"
            label={`Câu ${index + 1} trên ${cards.length}`}
          />
          <span className="shrink-0 font-display text-base font-extrabold text-ink-soft tabular-nums">
            {index + 1}/{cards.length}
          </span>
        </div>

        <Card key={current.id} className="anim-pop-in mt-4 p-5">
          {topic && (
            <p className="font-display text-sm font-bold uppercase tracking-wide text-grape-dark">
              {topic.name}
            </p>
          )}

          {/* Mặt trước: nghĩa tiếng Việt + chức năng. Cố tình chưa hiện câu
              tiếng Anh để người học phải tự nghĩ ra trước khi lật */}
          <p className="mt-2 text-xl font-bold leading-snug text-ink">
            {current.vietnamese_text}
          </p>

          {!revealed ? (
            <Button
              block
              className="mt-6"
              icon={<Eye size={20} strokeWidth={2.5} />}
              onClick={() => setRevealed(true)}
            >
              Xem câu tiếng Anh
            </Button>
          ) : (
            <div className="anim-slide-in mt-5 border-t-2 border-cloud-deep pt-5">
              <div className="flex items-start gap-3">
                <p className="flex-1 font-display text-xl font-extrabold leading-snug text-grape-dark">
                  {current.english_text}
                </p>
                <IconButton
                  icon={<Volume2 size={20} strokeWidth={2.5} />}
                  label="Nghe phát âm"
                  onClick={() => speak(current.english_text)}
                />
              </div>

              {/* Tô màu phân đoạn khung/chỗ thay được — tiếp xúc thụ động với
                  cấu trúc câu trước khi phải tự ghép lại ở bước ôn tập */}
              {chunks.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-bold text-ink-soft">
                    Cấu trúc câu
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {chunks.map((ch) => (
                      <span
                        key={ch.id}
                        className={`rounded-pill border-2 px-3 py-1.5 font-display text-sm font-bold ${
                          ch.kind === "slot"
                            ? "border-dashed border-sun bg-sun-soft text-sun-dark"
                            : "border-cloud-deep bg-cloud text-ink-soft"
                        }`}
                      >
                        {ch.text}
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-ink-faint">
                    Viền nét đứt là phần đổi được để dùng cho tình huống khác.
                  </p>
                </div>
              )}

              {current.context_tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {current.context_tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-pill bg-sky-soft px-3 py-1 text-sm font-bold text-sky-dark"
                    >
                      {CONTEXT_LABEL[tag] ?? tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </Card>
      </Screen>

      {revealed && (
        <div className="anim-pop-in fixed inset-x-0 bottom-0 z-40 border-t-2 border-cloud-deep bg-white pb-[max(1rem,var(--safe-bottom))] pt-4">
          <Screen width="narrow">
            <Button
              block
              tone="leaf"
              loading={saving}
              onClick={handleUnderstood}
            >
              {index < cards.length - 1 ? "Đã hiểu — câu tiếp" : "Đã hiểu — xong"}
            </Button>
          </Screen>
        </div>
      )}
    </div>
  );
}
