import { PageSkeleton } from "@/components/ui/PageSkeleton";

export default function AgentsLoading() {
  return <PageSkeleton titleWidth="w-52" subtitleWidth="w-80" cards={6} />;
}
