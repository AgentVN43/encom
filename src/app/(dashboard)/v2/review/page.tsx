"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getDueCards, getTopicChunks, saveReview } from "@/lib/v2/db";
import { buildChunkQuestion, isChunkOrderCorrect } from "@/lib/v2/session";
import type { ChunkTile as Tile } from "@/lib/v2/session";
import { gradeFromResult } from "@/lib/v2/srs";
import type { V2Card, V2Chunk } from "@/lib/v2/types";
import { Screen, Loader, EmptyState } from "@/components/ui/Layout";
import Button from "@/components/ui/Button";
import IconButton from "@/components/ui/IconButton";
import Card from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import ChunkTile from "@/components/ui/ChunkTile";
import { ArrowLeft, RotateCcw, Volume2 } from "lucide-react";
import { cancelSpeech, speakText } from "@/lib/utils";

/** Số câu mỗi phiên ôn — đủ dài để có tác dụng, đủ ngắn để làm lúc nghỉ trưa */
const REVIEW_LIMIT = 20;

interface Question {
  card: V2Card;
  tiles: Tile[];
  solution: V2Chunk[];
}

export default function V2ReviewPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  const [index, setIndex] = useState(0);
  /** Mẩu đã xếp, theo đúng thứ tự người học đặt */
  const [placed, setPlaced] = useState<Tile[]>([]);
  const [checked, setChecked] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
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
        router.replace(`/login?redirect=${encodeURIComponent("/v2/review")}`);
        return;
      }
      if (cancelled) return;
      setUserId(session.user.id);

      try {
        const rows = await getDueCards(session.user.id, REVIEW_LIMIT);
        if (cancelled) return;

        const cards = rows.map((r) => r.v2_cards).filter(Boolean);
        const topicIds = [...new Set(cards.map((c) => c.topic_id))];

        // Mẩu nhiễu lấy trong cùng chủ đề — cùng chức năng giao tiếp thì đủ
        // giống để phải đọc kỹ, khác chủ đề thì lộ liễu
        const pools = await Promise.all(
          topicIds.map((id) =>
            getTopicChunks(id).catch(() => [] as V2Chunk[])
          )
        );
        if (cancelled) return;

        const poolByTopic = new Map<string, V2Chunk[]>();
        topicIds.forEach((id, i) => poolByTopic.set(id, pools[i]));

        const built: Question[] = [];
        for (const card of cards) {
          const pool = poolByTopic.get(card.topic_id) ?? [];
          const own = pool.filter((c) => c.card_id === card.id);
          // Câu chưa được chia mẩu thì không ra được đề ghép — bỏ qua thay vì
          // hiện một đề trống không làm gì được
          if (own.length === 0) continue;
          const { tiles, solution } = buildChunkQuestion(own, pool);
          built.push({ card, tiles, solution });
        }

        setQuestions(built);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Không tải được bài ôn");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const current = questions[index];

  /** Mẩu còn trong khay — suy ra từ `placed` để không giữ hai nguồn sự thật */
  const tray = useMemo(() => {
    if (!current) return [];
    const used = new Set(placed.map((t) => t.id));
    return current.tiles.filter((t) => !used.has(t.id));
  }, [current, placed]);

  const speak = useCallback((text: string) => {
    speakText(text, "en-US");
  }, []);

  const handleCheck = async () => {
    if (!current || !userId || checked) return;

    const correct = isChunkOrderCorrect(placed, current.solution);
    setIsCorrect(correct);
    setChecked(true);
    setScore((s) =>
      correct ? { ...s, correct: s.correct + 1 } : { ...s, wrong: s.wrong + 1 }
    );
    speak(current.card.english_text);

    try {
      await saveReview(userId, current.card.id, gradeFromResult(correct));
    } catch {
      // Lịch ôn ghi hỏng thì thẻ sẽ hiện lại ở phiên sau — chấp nhận được,
      // không nên chặn người học giữa chừng vì một lần mạng chập chờn
    }
  };

  const handleNext = () => {
    cancelSpeech();
    if (index < questions.length - 1) {
      setIndex((i) => i + 1);
      setPlaced([]);
      setChecked(false);
    } else {
      setDone(true);
    }
  };

  if (loading) return <Loader label="Đang chuẩn bị bài ôn..." />;

  if (error) {
    return (
      <Screen width="narrow" className="py-10">
        <EmptyState
          emoji="😕"
          title="Không tải được bài ôn"
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

  if (questions.length === 0) {
    return (
      <Screen width="narrow" className="py-10">
        <EmptyState
          emoji="🌤️"
          title="Chưa có câu nào đến hạn"
          hint="Lịch giãn cách chỉ đưa câu ra khi đã đến lúc dễ quên. Học thêm câu mới trong lúc chờ."
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
            Xong phiên ôn
          </p>
          <div className="mt-3 font-display text-5xl font-extrabold text-grape tabular-nums">
            {pct}%
          </div>
          <ProgressBar
            percent={pct}
            tone="grape"
            className="mt-3"
            label="Tỉ lệ ghép đúng"
          />

          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-card bg-leaf-soft p-4">
              <div className="font-display text-3xl font-extrabold text-leaf-dark tabular-nums">
                {score.correct}
              </div>
              <div className="text-sm font-bold text-leaf-dark">Đúng</div>
            </div>
            <div className="rounded-card bg-cherry-soft p-4">
              <div className="font-display text-3xl font-extrabold text-cherry-dark tabular-nums">
                {score.wrong}
              </div>
              <div className="text-sm font-bold text-cherry-dark">Chưa đúng</div>
            </div>
          </div>

          <p className="mt-5 text-sm text-ink-soft">
            Câu ghép sai sẽ quay lại sớm, câu ghép đúng giãn ra xa hơn.
          </p>

          <Button block className="mt-5" onClick={() => router.push("/home")}>
            Về trang chủ
          </Button>
        </Card>
      </Screen>
    );
  }

  if (!current) return null;

  const percent = ((index + 1) / questions.length) * 100;
  const allPlaced = tray.length === 0 && placed.length > 0;

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
            label={`Câu ${index + 1} trên ${questions.length}`}
          />
          <span className="shrink-0 font-display text-base font-extrabold text-ink-soft tabular-nums">
            {index + 1}/{questions.length}
          </span>
        </div>

        <Card
          key={current.card.id}
          className={`anim-pop-in mt-4 p-5 ${
            checked ? (isCorrect ? "anim-bounce" : "anim-shake") : ""
          }`}
        >
          <p className="font-display text-sm font-bold uppercase tracking-wide text-ink-soft">
            Ghép thành câu tiếng Anh
          </p>
          <p className="mt-2 text-xl font-bold leading-snug text-ink">
            {current.card.vietnamese_text}
          </p>

          {/* Chỗ xếp câu. Luôn chừa sẵn chiều cao để khay không nhảy lên xuống
              mỗi lần thêm bớt một mẩu */}
          <div
            className="mt-5 flex min-h-24 flex-wrap content-start gap-2 rounded-card
              border-2 border-dashed border-cloud-deep bg-cloud p-3"
          >
            {placed.length === 0 && (
              <p className="self-center text-sm text-ink-faint">
                Bấm các mẩu bên dưới để xếp thành câu
              </p>
            )}
            {placed.map((tile) => (
              <ChunkTile
                key={tile.id}
                text={tile.text}
                isSlot={tile.kind === "slot"}
                state={checked ? (isCorrect ? "correct" : "wrong") : "placed"}
                disabled={checked}
                onClick={() =>
                  setPlaced((p) => p.filter((t) => t.id !== tile.id))
                }
              />
            ))}
          </div>

          {!checked && (
            <div className="mt-4 flex flex-wrap gap-2">
              {tray.map((tile) => (
                <ChunkTile
                  key={tile.id}
                  text={tile.text}
                  isSlot={tile.kind === "slot"}
                  onClick={() => setPlaced((p) => [...p, tile])}
                />
              ))}
            </div>
          )}

          {checked && (
            <div className="anim-slide-in mt-5 border-t-2 border-cloud-deep pt-4">
              <p className="text-sm font-bold text-ink-soft">Câu đúng</p>
              <div className="mt-1 flex items-start gap-3">
                <p className="flex-1 font-display text-lg font-extrabold leading-snug text-grape-dark">
                  {current.card.english_text}
                </p>
                <IconButton
                  icon={<Volume2 size={20} strokeWidth={2.5} />}
                  label="Nghe phát âm"
                  onClick={() => speak(current.card.english_text)}
                />
              </div>
            </div>
          )}
        </Card>

        {!checked && placed.length > 0 && (
          <button
            type="button"
            onClick={() => setPlaced([])}
            className="mx-auto mt-3 flex min-h-12 items-center gap-2 px-3 font-display
              text-sm font-bold text-ink-soft"
          >
            <RotateCcw size={16} strokeWidth={2.5} />
            Xếp lại từ đầu
          </button>
        )}
      </Screen>

      {/* Thanh dính đáy — luôn trong tầm ngón cái trên điện thoại */}
      <div
        className={`fixed inset-x-0 bottom-0 z-40 border-t-2 pb-[max(1rem,var(--safe-bottom))] pt-4 ${
          checked
            ? isCorrect
              ? "border-leaf bg-leaf-soft"
              : "border-cherry bg-cherry-soft"
            : "border-cloud-deep bg-white"
        }`}
      >
        <Screen width="narrow">
          {checked ? (
            <div className="flex items-center justify-between gap-3">
              <p
                className={`font-display text-lg font-extrabold ${
                  isCorrect ? "text-leaf-dark" : "text-cherry-dark"
                }`}
              >
                {isCorrect ? "Chính xác" : "Chưa đúng"}
              </p>
              <Button
                tone={isCorrect ? "leaf" : "cherry"}
                size="md"
                onClick={handleNext}
              >
                {index < questions.length - 1 ? "Câu tiếp" : "Xem kết quả"}
              </Button>
            </div>
          ) : (
            <Button block disabled={!allPlaced} onClick={handleCheck}>
              Kiểm tra
            </Button>
          )}
        </Screen>
      </div>
    </div>
  );
}
