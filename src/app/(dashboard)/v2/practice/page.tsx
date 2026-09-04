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
import BottomSheet from "@/components/ui/BottomSheet";
import { ArrowLeft, Lightbulb, Volume2 } from "lucide-react";
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
   * Cụm gốc của câu — phần nằm trong ngoặc lúc soạn thẻ.
   *
   * Ví dụ mẫu CHỈ được dựng từ cụm này, tuyệt đối không lấy các cụm thay thế
   * khác. Lý do: `options` là toàn bộ cụm của slot, nên mọi cụm không phải đáp
   * án đều đang là một lựa chọn — đem chúng ra làm ví dụ chính là in ra danh
   * sách đáp án sai, người học loại trừ là ra ngay.
   *
   * Cụm gốc thì khác: nó là câu người học ĐÃ HỌC, nên đưa ra là nhắc lại thứ
   * họ vốn biết, và nhiều nhất chỉ loại được một lựa chọn.
   */
  originalText: string;
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
  const [hintOpen, setHintOpen] = useState(false);
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

          const originalText =
            own.find((c) => c.id === slot.slot_chunk_id)?.text ?? "";

          // Đáp án không được TRÙNG cụm gốc, vì cụm gốc chính là ví dụ mẫu —
          // trùng thì ví dụ in thẳng đáp án ra
          const notOriginal = slot.fillers.filter(
            (f) =>
              f.filler_text.trim().toLowerCase() !==
              originalText.trim().toLowerCase()
          );
          const answer = shuffleArray(
            notOriginal.length > 0 ? notOriginal : slot.fillers
          )[0];

          built.push({
            card,
            chunks: [...own].sort((a, b) => a.position - b.position),
            slotChunkId: slot.slot_chunk_id,
            answer,
            options: shuffleArray(slot.fillers),
            originalText,
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
    if (!current || !userId || picked) return;
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
      setHintOpen(false);
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
          <div className="flex items-start justify-between gap-3">
            <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
              Giữ khung câu, đổi phần trong ô trống
            </p>
            {/* Ví dụ để người học TỰ MỞ. Hiện thẳng ra thì slot ít cụm sẽ lộ
                đáp án qua phép loại trừ — xem chú thích ở `examples`. */}
            {current.originalText && (
              <IconButton
                icon={<Lightbulb size={20} strokeWidth={2.5} />}
                label="Xem lại câu gốc đã học"
                tone="sun"
                onClick={() => setHintOpen(true)}
              />
            )}
          </div>

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

        <div className="mt-4 space-y-3">
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

      <BottomSheet
        open={hintOpen}
        title="Câu gốc bạn đã học"
        onClose={() => setHintOpen(false)}
      >
        <div className="space-y-4 pb-2">
          <div>
            <p className="font-display text-lg font-extrabold leading-snug text-ink">
              {sentenceWith(current.originalText)}
            </p>
            <p className="mt-0.5 text-sm text-ink-soft">
              {current.card.vietnamese_text}
            </p>
          </div>
          <p className="border-t-2 border-cloud-deep pt-3 text-sm text-ink-faint">
            Khung câu giữ nguyên, chỉ phần trong ô trống đổi theo tình huống.
            Đây là câu bạn đã học, không phải đáp án của câu hỏi này.
          </p>
        </div>
      </BottomSheet>

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
