"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  getDueCards,
  getV2Categories,
  getV2Topics,
  type V2Category,
  type V2Topic,
} from "@/lib/v2/db";
import { Screen, Loader, EmptyState } from "@/components/ui/Layout";
import Button from "@/components/ui/Button";
import Card, { TappableCard } from "@/components/ui/Card";
import { CalendarClock, ChevronRight } from "lucide-react";

/** Lấy dư một khoảng để đếm — chỉ cần biết "nhiều hơn 50" là đủ để hiển thị */
const DUE_COUNT_CAP = 50;

export default function V2HomePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categories, setCategories] = useState<V2Category[]>([]);
  const [topics, setTopics] = useState<V2Topic[]>([]);
  const [dueCount, setDueCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace(`/login?redirect=${encodeURIComponent("/v2")}`);
        return;
      }

      try {
        // Danh sách nội dung không phụ thuộc số thẻ tới hạn — hỏng cái nào thì
        // cái đó về rỗng, không kéo sập cả trang
        const [cats, tops, due] = await Promise.all([
          getV2Categories(),
          getV2Topics(),
          getDueCards(session.user.id, DUE_COUNT_CAP).catch(() => []),
        ]);
        if (cancelled) return;
        setCategories(cats);
        setTopics(tops);
        setDueCount(due.length);
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Không tải được dữ liệu");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  if (loading) return <Loader label="Đang tải nội dung..." />;

  if (error) {
    return (
      <Screen width="narrow" className="py-10">
        <EmptyState
          emoji="😕"
          title="Không tải được nội dung"
          hint={error}
          action={
            <Button className="mt-2" onClick={() => location.reload()}>
              Thử lại
            </Button>
          }
        />
      </Screen>
    );
  }

  if (topics.length === 0) {
    return (
      <Screen width="narrow" className="py-10">
        <EmptyState
          emoji="📭"
          title="Chưa có nội dung"
          hint="Chưa có chủ đề nào được soạn cho chương trình này."
        />
      </Screen>
    );
  }

  return (
    <div className="dotted-bg min-h-dvh pb-12">
      <Screen width="wide" className="py-6">
        <h1 className="text-2xl text-ink">Tiếng Anh công sở</h1>
        <p className="mt-1 text-ink-soft">
          Chọn một chức năng giao tiếp để học, hoặc ôn lại những câu đã đến hạn.
        </p>

        {/* Ôn tập đứng trước danh sách chủ đề: đã đến hạn thì ôn quan trọng hơn
            học thêm câu mới — học dồn mà không ôn thì quên sạch */}
        <Card className="mt-5 flex items-center gap-4 p-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-blob bg-grape-soft text-grape-dark">
            <CalendarClock size={24} strokeWidth={2.5} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-display text-lg font-extrabold text-ink">
              {dueCount > 0 ? "Đến hạn ôn tập" : "Chưa có gì cần ôn"}
            </p>
            <p className="text-sm text-ink-soft">
              {dueCount > 0
                ? `${dueCount}${dueCount >= DUE_COUNT_CAP ? "+" : ""} câu, trộn xen kẽ nhiều chủ đề`
                : "Học thêm câu mới để lịch ôn bắt đầu chạy"}
            </p>
          </div>
          <Button
            size="md"
            disabled={dueCount === 0}
            onClick={() => router.push("/v2/review")}
          >
            Ôn ngay
          </Button>
        </Card>

        <div className="mt-8 space-y-7">
          {categories.map((cat) => {
            const inCat = topics.filter((t) => t.category_id === cat.id);
            if (inCat.length === 0) return null;
            return (
              <section key={cat.id}>
                <h2 className="text-lg text-ink">{cat.name}</h2>
                {cat.description && (
                  <p className="mt-0.5 text-sm text-ink-soft">
                    {cat.description}
                  </p>
                )}
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {inCat.map((topic) => (
                    <TopicRow
                      key={topic.id}
                      topic={topic}
                      onOpen={() => router.push(`/v2/learn/${topic.id}`)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </Screen>
    </div>
  );
}

function TopicRow({ topic, onOpen }: { topic: V2Topic; onOpen: () => void }) {
  return (
    <TappableCard onClick={onOpen} className="flex items-center gap-3 p-4">
      <div className="min-w-0 flex-1">
        <p className="font-display font-extrabold text-ink">{topic.name}</p>
        {topic.description && (
          <p className="mt-0.5 truncate text-sm text-ink-soft">
            {topic.description}
          </p>
        )}
      </div>
      <ChevronRight size={20} className="shrink-0 text-ink-faint" />
    </TappableCard>
  );
}
