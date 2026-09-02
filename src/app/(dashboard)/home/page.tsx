"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCategories, getTopics, getCards, getProgress } from "@/lib/db";
import {
  getDrillSlots,
  getDueCards,
  getV2CardCounts,
  getV2Topics,
  type V2Topic,
} from "@/lib/v2/db";
import type { Category, Topic, Card as CardType } from "@/lib/types";
import { isMastered } from "@/lib/constants";
import {
  BookText,
  CalendarClock,
  Check,
  ChevronRight,
  MessagesSquare,
  Repeat2,
  Sparkles,
} from "lucide-react";
import { Screen, EmptyState, Skeleton } from "@/components/ui/Layout";
import Card, { TappableCard } from "@/components/ui/Card";
import ProgressBar from "@/components/ui/ProgressBar";
import Button from "@/components/ui/Button";

interface ProgressItem {
  card_id: string;
  streak: number;
  cards: { topic_id: string };
}

interface CategoryGroup {
  category: Category | null;
  topics: Topic[];
}

/** Đếm dư một khoảng là đủ để hiện "50+", không cần con số chính xác */
const DUE_COUNT_CAP = 50;

/**
 * Trang chủ — lối vào DUY NHẤT của mọi hình thức học.
 *
 * Hệ thống chia theo ĐƠN VỊ HỌC chứ không theo đối tượng người dùng:
 *   - Học từ vựng  → bảng v1, chọn đáp án đúng cho từng từ
 *   - Học theo câu → bảng v2, ghép mẩu thành câu, có lịch ôn FSRS
 * Một người dùng cả hai, nên hai phần nằm chung một trang thay vì hai mặt tiền
 * riêng như bản trước.
 */
export default function HomePage() {
  const router = useRouter();
  const [groups, setGroups] = useState<CategoryGroup[]>([]);
  const [topicCount, setTopicCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [authed, setAuthed] = useState(false);
  const [topicStatus, setTopicStatus] = useState<
    Record<string, { total: number; mastered: number }>
  >({});

  const [v2Topics, setV2Topics] = useState<V2Topic[]>([]);
  const [v2Counts, setV2Counts] = useState<Record<string, number>>({});
  const [dueCount, setDueCount] = useState(0);
  const [drillCount, setDrillCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      setAuthed(!!session);

      // Hai phần độc lập nhau: phần nào hỏng thì phần đó rỗng, không kéo sập
      // cả trang chủ như khi gộp chung một Promise.all
      const v1 = (async () => {
        const [cats, tops, allCards, progress] = await Promise.all([
          getCategories(),
          getTopics(),
          getCards(),
          session
            ? (getProgress(session.user.id) as Promise<ProgressItem[]>)
            : Promise.resolve([] as ProgressItem[]),
        ]);
        if (cancelled) return;

        // Chủ đề "Chưa phân loại" là nơi thẻ mồ côi dồn về khi xoá chủ đề gốc
        // — không phải bài học thật, ẩn khỏi học viên.
        const visibleTops = tops.filter((t) => !t.is_fallback);

        const grouped: CategoryGroup[] = cats
          .map((cat) => ({
            category: cat as Category | null,
            topics: visibleTops.filter((t) => t.category_id === cat.id),
          }))
          .filter((g) => g.topics.length > 0);
        const ungrouped = visibleTops.filter(
          (t) => !t.category_id || !cats.some((c) => c.id === t.category_id)
        );
        if (ungrouped.length > 0) grouped.push({ category: null, topics: ungrouped });

        setGroups(grouped);
        setTopicCount(visibleTops.length);

        const cardsByTopic: Record<string, number> = {};
        allCards.forEach((c: CardType) => {
          cardsByTopic[c.topic_id] = (cardsByTopic[c.topic_id] || 0) + 1;
        });

        const masteredByTopic: Record<string, number> = {};
        progress.forEach((p) => {
          if (isMastered(p.streak)) {
            const tId = p.cards?.topic_id;
            if (tId) masteredByTopic[tId] = (masteredByTopic[tId] || 0) + 1;
          }
        });

        const status: Record<string, { total: number; mastered: number }> = {};
        visibleTops.forEach((t) => {
          status[t.id] = {
            total: cardsByTopic[t.id] || 0,
            mastered: masteredByTopic[t.id] || 0,
          };
        });
        setTopicStatus(status);
      })().catch(() => {});

      const v2 = (async () => {
        const [tops, counts, due, drills] = await Promise.all([
          getV2Topics(),
          getV2CardCounts(),
          session
            ? getDueCards(session.user.id, DUE_COUNT_CAP).catch(() => [])
            : Promise.resolve([]),
          // Chưa chạy migration filler thì phần này rỗng, không kéo sập trang
          getDrillSlots().catch(() => []),
        ]);
        if (cancelled) return;

        // Liệt kê phẳng theo chức năng, không nhóm theo lĩnh vực nữa: lĩnh vực
        // giờ nằm ở TỪNG CÂU và đa trị, nên một chủ đề có thể chứa câu thuộc
        // cả Work lẫn Life — xếp nó vào một nhóm là nói sai. Bộ lọc theo lĩnh
        // vực sẽ thay chỗ này khi thư viện đủ câu để lọc có nghĩa.
        setV2Topics(tops);
        setV2Counts(counts);
        setDueCount(due.length);
        setDrillCount(drills.length);
      })().catch(() => {});

      await Promise.all([v1, v2]);
      if (!cancelled) setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /** Chỉ cho vào học khi đã đăng nhập */
  const open = (path: string) => {
    if (!authed) {
      router.push(`/login?redirect=${encodeURIComponent(path)}`);
      return;
    }
    router.push(path);
  };

  if (loading) {
    return (
      <Screen width="wide" className="py-4">
        <Skeleton className="h-36 w-full" />
        <div className="mt-6 space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      </Screen>
    );
  }

  const totals = Object.values(topicStatus).reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      mastered: acc.mastered + s.mastered,
    }),
    { total: 0, mastered: 0 }
  );

  const nothingAtAll = topicCount === 0 && v2Topics.length === 0;

  return (
    <Screen width="wide" className="py-4">
      <section className="overflow-hidden rounded-jumbo bg-grape p-5 text-white lg:p-8">
        <h1 className="text-2xl text-white lg:text-4xl">
          {authed ? "Hôm nay học gì?" : "Học tiếng Anh theo cách của bạn"}
        </h1>
        <p className="mt-1 text-sm font-bold text-white/80 lg:text-base">
          {authed
            ? `Bạn đã thuộc ${totals.mastered} trên ${totals.total} từ`
            : "Học từ vựng riêng lẻ hoặc học nguyên cụm câu — chọn cách hợp với bạn"}
        </p>

        {authed && totals.total > 0 && (
          <ProgressBar
            percent={(totals.mastered / totals.total) * 100}
            tone="sun"
            className="mt-4"
            label="Tổng số từ đã thuộc"
          />
        )}

        {!authed && (
          <Button
            tone="sun"
            className="mt-4"
            icon={<Sparkles size={18} strokeWidth={2.5} />}
            onClick={() => router.push("/login")}
          >
            Bắt đầu học
          </Button>
        )}
      </section>

      {/* Đến hạn ôn đứng trên mọi thứ: quên rồi thì học thêm cũng vô ích */}
      {authed && dueCount > 0 && (
        <Card className="mt-5 flex items-center gap-4 p-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-blob bg-grape-soft text-grape-dark">
            <CalendarClock size={24} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-extrabold text-ink">
              Đến hạn ôn tập
            </p>
            <p className="text-sm text-ink-soft">
              {dueCount}
              {dueCount >= DUE_COUNT_CAP ? "+" : ""} câu, trộn xen kẽ nhiều chủ
              đề
            </p>
          </div>
          <Button size="md" onClick={() => open("/v2/review")}>
            Ôn ngay
          </Button>
        </Card>
      )}

      {/* Rèn luyện đứng sau Ôn tập: đến hạn thì ôn trước, rèn luyện là việc
          chọn làm khi còn thời gian */}
      {authed && drillCount > 0 && (
        <Card className="mt-3 flex items-center gap-4 p-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-blob bg-sun-soft text-sun-dark">
            <Repeat2 size={24} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-extrabold text-ink">
              Rèn luyện
            </p>
            <p className="text-sm text-ink-soft">
              Giữ khung câu, đổi nội dung sang tình huống mới
            </p>
          </div>
          <Button
            tone="plain"
            size="md"
            onClick={() => open("/v2/practice")}
          >
            Luyện
          </Button>
        </Card>
      )}

      {nothingAtAll ? (
        <EmptyState
          emoji="📚"
          title="Chưa có chủ đề nào"
          hint="Quản trị viên chưa thêm nội dung học. Quay lại sau nhé!"
        />
      ) : (
        <div className="mt-8 space-y-10">
          {/* Học từ vựng — đặt trước vì đây là nội dung đã có sẵn học viên */}
          {topicCount > 0 && (
            <TrackSection
              icon={<BookText size={20} strokeWidth={2.5} />}
              title="Học từ vựng"
              hint="Mỗi thẻ một từ, chọn nghĩa đúng"
            >
              {groups.map((group) => (
                <GroupBlock
                  key={group.category?.id || "khac"}
                  name={group.category?.name || "Chủ đề khác"}
                  description={group.category?.description}
                  count={group.topics.length}
                >
                  {group.topics.map((topic) => {
                    const st = topicStatus[topic.id];
                    const total = st?.total ?? 0;
                    const mastered = st?.mastered ?? 0;
                    const done = authed && total > 0 && mastered === total;

                    return (
                      <TopicCard
                        key={topic.id}
                        name={topic.name}
                        done={done}
                        icon={<BookText size={22} strokeWidth={2.5} />}
                        subtitle={
                          total === 0
                            ? "Chưa có từ vựng"
                            : !authed
                              ? `${total} từ vựng`
                              : done
                                ? "Đã thuộc hết"
                                : `${mastered}/${total} từ đã thuộc`
                        }
                        percent={
                          authed && total > 0 && !done
                            ? (mastered / total) * 100
                            : undefined
                        }
                        progressLabel={`${topic.name}: ${mastered} trên ${total} từ`}
                        onClick={() => open(`/learn/${topic.id}`)}
                      />
                    );
                  })}
                </GroupBlock>
              ))}
            </TrackSection>
          )}

          {/* Học theo câu — liệt kê phẳng theo chức năng giao tiếp */}
          {v2Topics.length > 0 && (
            <TrackSection
              icon={<MessagesSquare size={20} strokeWidth={2.5} />}
              title="Học theo câu"
              hint="Ghép cụm thành câu hoàn chỉnh, có lịch ôn giãn cách"
            >
              <div className="space-y-3 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
                {v2Topics.map((topic) => {
                  const total = v2Counts[topic.id] ?? 0;
                  return (
                    <TopicCard
                      key={topic.id}
                      name={topic.name}
                      done={false}
                      icon={<MessagesSquare size={22} strokeWidth={2.5} />}
                      subtitle={total === 0 ? "Chưa có câu nào" : `${total} câu`}
                      onClick={() => open(`/v2/learn/${topic.id}`)}
                    />
                  );
                })}
              </div>
            </TrackSection>
          )}
        </div>
      )}
    </Screen>
  );
}

/** Một hình thức học — gom các nhóm chủ đề cùng đơn vị học lại dưới một đầu đề */
function TrackSection({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2.5 border-b-2 border-cloud-deep pb-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-blob bg-grape-soft text-grape-dark">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-xl text-ink lg:text-2xl">{title}</h2>
          <p className="text-sm text-ink-soft">{hint}</p>
        </div>
      </div>
      <div className="mt-5 space-y-7">{children}</div>
    </section>
  );
}

function GroupBlock({
  name,
  description,
  count,
  children,
}: {
  name: string;
  description?: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline gap-2">
        <h3 className="font-display text-lg font-extrabold text-ink">{name}</h3>
        <span className="text-sm font-bold text-ink-faint">
          {count} chủ đề
        </span>
      </div>
      {description && (
        <p className="mb-3 text-sm text-ink-soft">{description}</p>
      )}
      <div className="mt-3 space-y-3 lg:grid lg:grid-cols-3 lg:gap-4 lg:space-y-0">
        {children}
      </div>
    </div>
  );
}

function TopicCard({
  name,
  subtitle,
  icon,
  done,
  percent,
  progressLabel,
  onClick,
}: {
  name: string;
  subtitle: string;
  icon: React.ReactNode;
  done: boolean;
  percent?: number;
  progressLabel?: string;
  onClick: () => void;
}) {
  return (
    <TappableCard
      onClick={onClick}
      className={`p-4 ${done ? "border-leaf bg-leaf-soft" : ""}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid size-12 shrink-0 place-items-center rounded-blob ${
            done ? "bg-leaf/20 text-leaf-dark" : "bg-cloud text-ink-soft"
          }`}
          aria-hidden
        >
          {icon}
        </span>

        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-extrabold text-ink">
            {name}
          </p>
          <p className="text-sm font-bold text-ink-soft">{subtitle}</p>
        </div>

        {done ? (
          <Check size={24} strokeWidth={3} className="shrink-0 text-leaf" />
        ) : (
          <ChevronRight
            size={22}
            strokeWidth={2.5}
            className="shrink-0 text-ink-faint"
          />
        )}
      </div>

      {percent !== undefined && (
        <ProgressBar
          percent={percent}
          tone="grape"
          className="mt-3 h-2.5"
          label={progressLabel ?? name}
        />
      )}
    </TappableCard>
  );
}
