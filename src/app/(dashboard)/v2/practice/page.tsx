"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getDrillSlots,
  getV2CardsByIds,
  getV2Chunks,
  logPracticeAttempt,
  type V2SubstitutionFiller,
} from "@/lib/v2/db";
import type { V2Card, V2Chunk } from "@/lib/v2/types";
import { shuffleArray } from "@/lib/utils";
import { Screen, Loader, EmptyState } from "@/components/ui/Layout";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import OptionButton, { type OptionState } from "@/components/ui/OptionButton";
import { ArrowLeft, Volume2 } from "lucide-react";
import { cancelSpeech, speakText } from "@/lib/utils";

/** Số câu mỗi buổi rèn luyện */
const DRILL_LIMIT = 12;

interface Drill {
  card: V2Card;
  /** Mẩu của câu, đã xếp theo thứ tự — mẩu slot đang hỏi bị thay bằng ô trống */
  chunks: V2Chunk[];
  slotChunkId: string;
  /** Cụm đúng cho tình huống đang nêu */
  answer: V2SubstitutionFiller;
  /** Các lựa chọn, đã trộn */
  options: V2SubstitutionFiller[];
  /**
   * Ví dụ mẫu hiện TRƯỚC khi hỏi — nguyên tắc "cho gặp trước, bắt làm sau".
   * Nhảy thẳng vào kiểm tra thì người học chưa từng thấy khung câu này dùng
   * với nội dung khác mà đã bị hỏi, chỉ còn cách đoán.
   *
   * Rỗng khi slot có dưới 3 cụm: lúc đó mọi cụm không phải đáp án đều là mẩu
   * nhiễu, đưa ra làm ví dụ là lộ đáp án.
   */
  examples: V2SubstitutionFiller[];
}

/**
 * Rèn luyện — Substitution Drill.
 *
 * Giữ nguyên khung câu, đổi phần thay được sang tình huống mới. Mục đích là
 * dạy TRANSFER: người học thấy cùng một khung dùng được cho nhiều nội dung,
 * thay vì học thuộc từng câu rời.
 *
 * Tách khỏi Ôn tập vì chấm bằng thước khác: bài này ghi vào
 * `v2_practice_attempts`, không đụng lịch FSRS trong `v2_progress` — làm được
 * drill không có nghĩa là đã nhớ câu.
 */
export default function V2PracticePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [drills, setDrills] = useState<Drill[]>([]);

  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  /** Đang ở pha xem ví dụ, chưa tới pha trả lời */
  const [showingExamples, setShowingExamples] = useState(true);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [done, setDone] = useState(false);

  useEffect(() => cancelSpeech, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/login?redirect=${encodeURIComponent("/v2/practice")}`);
        return;
      }
      if (cancelled) return;
      setUserId(session.user.id);

      try {
        const slots = await getDrillSlots();
        if (cancelled) return;
        if (slots.length === 0) {
          setDrills([]);
          return;
        }

        // Lấy mẩu và thẻ của đúng những câu có cụm thay thế
        const cardIds = [...new Set(slots.map((s) => s.card_id))];
        const chunks = await getV2Chunks(cardIds);
        if (cancelled) return;

        const chunksByCard = new Map<string, V2Chunk[]>();
        for (const ch of chunks) {
          const list = chunksByCard.get(ch.card_id) ?? [];
          list.push(ch);
          chunksByCard.set(ch.card_id, list);
        }

        const cardRows = await getV2CardsByIds(cardIds);
        if (cancelled) return;
        const cardsById = new Map(cardRows.map((c) => [c.id, c]));

        const built: Drill[] = [];
        for (const slot of shuffleArray(slots)) {
          const card = cardsById.get(slot.card_id);
          const own = chunksByCard.get(slot.card_id);
          if (!card || !own) continue;

          // Mỗi slot ra một đề, cụm đúng bốc ngẫu nhiên trong các cụm đã duyệt
          const answer = shuffleArray(slot.fillers)[0];
          const others = slot.fillers.filter((f) => f.id !== answer.id);
          built.push({
            card,
            chunks: [...own].sort((a, b) => a.position - b.position),
            slotChunkId: slot.slot_chunk_id,
            answer,
            options: shuffleArray(slot.fillers),
            // Cần ít nhất 3 cụm mới có cái để làm ví dụ mà không lộ đáp án
            examples: slot.fillers.length >= 3 ? others.slice(0, 2) : [],
          });
          if (built.length >= DRILL_LIMIT) break;
        }

        setDrills(built);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(
          err instanceof Error ? err.message : "Không tải được bài rèn luyện"
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const current = drills[index];

  const speak = useCallback((text: string) => {
    speakText(text, "en-US");
  }, []);

  /** Câu hoàn chỉnh sau khi thay cụm — hiện sau khi chọn để thấy kết quả ghép */
  const assembled = useMemo(() => {
    if (!current) return "";
    return current.chunks
      .map((c) =>
        c.id === current.slotChunkId ? current.answer.filler_text : c.text
      )
      .join(" ")
      .replace(/\s+([,.!?;:])/g, "$1");
  }, [current]);

  /** Ghép khung câu với một cụm bất kỳ — dùng cho ví dụ mẫu */
  const sentenceWith = useCallback(
    (filler: string) => {
      if (!current) return "";
      return current.chunks
        .map((c) => (c.id === current.slotChunkId ? filler : c.text))
        .join(" ")
        .replace(/\s+([,.!?;:])/g, "$1");
    },
    [current]
  );

  const handlePick = async (fillerId: string) => {
    // Chặn theo examples.length chứ không theo cờ: câu không có ví dụ thì cờ
    // vẫn bật, chặn theo cờ sẽ làm nút hiện ra mà bấm không ăn
    if (!current || !userId || picked) return;
    if (showingExamples && current.examples.length > 0) return;
    setPicked(fillerId);

    const correct = fillerId === current.answer.id;
    setScore((s) =>
      correct ? { ...s, correct: s.correct + 1 } : { ...s, wrong: s.wrong + 1 }
    );
    speak(assembled);

    try {
      await logPracticeAttempt(userId, current.card.id, "applying", correct);
    } catch {
      // Log là số liệu phụ — hỏng thì bỏ qua, không cản việc luyện
    }
  };

  const handleNext = () => {
    cancelSpeech();
    if (index < drills.length - 1) {
      setIndex((i) => i + 1);
      setPicked(null);
      setShowingExamples(true);
    } else {
      setDone(true);
    }
  };

  if (loading) return <Loader label="Đang chuẩn bị bài rèn luyện..." />;

  if (error) {
    return (
      <Screen width="narrow" className="py-10">
        <EmptyState
          emoji="😕"
          title="Không tải được bài rèn luyện"
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

  if (drills.length === 0) {
    return (
      <Screen width="narrow" className="py-10">
        <EmptyState
          emoji="🧩"
          title="Chưa có bài rèn luyện"
          hint="Bài này cần câu có phần thay được kèm ít nhất hai cụm thay thế. Quản trị viên chưa soạn đủ."
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
    const answered = score.correct + score.wrong;
    const pct = answered === 0 ? 0 : Math.round((score.correct / answered) * 100);
    return (
      <Screen width="narrow" className="py-8">
        <Card className="anim-pop-in p-6 text-center">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
            Xong buổi rèn luyện
          </p>
          <div className="mt-3 font-display text-5xl font-extrabold text-grape tabular-nums">
            {pct}%
          </div>
          <ProgressBar
            percent={pct}
            tone="grape"
            className="mt-3"
            label="Tỉ lệ chọn đúng"
          />
          <p className="mt-5 text-sm text-ink-soft">
            Cùng một khung câu dùng được cho nhiều tình huống — đó là thứ giúp
            bạn tự đặt câu mới thay vì học thuộc từng câu.
          </p>
          <Button block className="mt-5" onClick={() => router.push("/home")}>
            Về trang chủ
          </Button>
        </Card>
      </Screen>
    );
  }

  if (!current) return null;

  const percent = ((index + 1) / drills.length) * 100;
  /** Còn phải xem ví dụ trước khi được chọn */
  const needExamples = showingExamples && current.examples.length > 0;

  return (
    <div className="dotted-bg min-h-dvh pb-40">
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
            label={`Câu ${index + 1} trên ${drills.length}`}
          />
          <span className="shrink-0 font-display text-base font-extrabold text-ink-soft tabular-nums">
            {index + 1}/{drills.length}
          </span>
        </div>

        <Card key={current.slotChunkId} className="anim-pop-in mt-4 p-5">
          <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
            Giữ khung câu, đổi phần trong ô trống
          </p>

          {/* Khung câu với ô trống ở đúng chỗ thay được */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {current.chunks.map((ch) =>
              ch.id === current.slotChunkId ? (
                <span
                  key={ch.id}
                  className="rounded-pill border-2 border-dashed border-sun bg-sun-soft px-4 py-1.5 font-display text-base font-extrabold text-sun-dark"
                >
                  ?
                </span>
              ) : (
                <span
                  key={ch.id}
                  className="rounded-pill border-2 border-cloud-deep bg-cloud px-3 py-1.5 font-display text-base font-bold text-ink"
                >
                  {ch.text}
                </span>
              )
            )}
          </div>

          <div className="mt-4 rounded-card bg-grape-soft p-3">
            <p className="text-sm font-bold text-grape-dark">Tình huống mới</p>
            <p className="mt-0.5 text-lg font-bold leading-snug text-ink">
              {current.answer.filler_vi}
            </p>
          </div>

          {picked && (
            <div className="anim-slide-in mt-4 border-t-2 border-cloud-deep pt-4">
              <p className="text-sm font-bold text-ink-soft">Câu hoàn chỉnh</p>
              <div className="mt-1 flex items-start gap-3">
                <p className="flex-1 font-display text-lg font-extrabold leading-snug text-grape-dark">
                  {assembled}
                </p>
                <IconButton
                  icon={<Volume2 size={20} strokeWidth={2.5} />}
                  label="Nghe phát âm"
                  onClick={() => speak(assembled)}
                />
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                Câu gốc: {current.card.english_text}
              </p>
            </div>
          )}
        </Card>

        {/* Pha ví dụ: cho gặp khung câu dùng với nội dung khác TRƯỚC khi hỏi.
            Người học nhìn ra quy luật thay vì đoán — đó mới là thứ giúp họ tự
            đặt câu mới sau này. */}
        {needExamples && (
          <Card className="anim-slide-in mt-4 p-5">
            <p className="font-display text-sm font-bold uppercase tracking-wide text-sky-dark">
              Ví dụ — cùng khung câu này
            </p>
            <div className="mt-3 space-y-3">
              {current.examples.map((ex) => (
                <div key={ex.id}>
                  <p className="font-display text-base font-extrabold leading-snug text-ink">
                    {sentenceWith(ex.filler_text)}
                  </p>
                  <p className="text-sm text-ink-soft">{ex.filler_vi}</p>
                </div>
              ))}
            </div>
            <Button
              block
              className="mt-4"
              onClick={() => setShowingExamples(false)}
            >
              Đã hiểu — làm thử
            </Button>
          </Card>
        )}

        <div
          className={`mt-4 space-y-3 ${needExamples ? "pointer-events-none opacity-40" : ""}`}
          aria-hidden={needExamples}
        >
          {current.options.map((opt, i) => {
            let state: OptionState = "idle";
            if (picked) {
              if (opt.id === current.answer.id) state = "correct";
              else if (opt.id === picked) state = "wrong";
              else state = "dimmed";
            }
            return (
              <OptionButton
                key={opt.id}
                index={i}
                text={opt.filler_text}
                state={state}
                size="block"
                disabled={!!picked}
                onClick={() => handlePick(opt.id)}
              />
            );
          })}
        </div>
      </Screen>

      {picked && (
        <div
          className={`anim-pop-in fixed inset-x-0 bottom-0 z-40 border-t-2 pb-[max(1rem,var(--safe-bottom))] pt-4 ${
            picked === current.answer.id
              ? "border-leaf bg-leaf-soft"
              : "border-cherry bg-cherry-soft"
          }`}
        >
          <Screen width="narrow">
            <div className="flex items-center justify-between gap-3">
              <p
                className={`font-display text-lg font-extrabold ${
                  picked === current.answer.id
                    ? "text-leaf-dark"
                    : "text-cherry-dark"
                }`}
              >
                {picked === current.answer.id ? "Chính xác" : "Chưa đúng"}
              </p>
              <Button
                tone={picked === current.answer.id ? "leaf" : "cherry"}
                size="md"
                onClick={handleNext}
              >
                {index < drills.length - 1 ? "Câu tiếp" : "Xem kết quả"}
              </Button>
            </div>
          </Screen>
        </div>
      )}
    </div>
  );
}
