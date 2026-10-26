import { PageLoading } from "@/components/PageLoading";

/**
 * Route-level loading boundary for the authenticated app. Next.js streams this
 * fallback while a chart page's server-side data requests are in flight, so the
 * user gets immediate feedback instead of an empty wait.
 */
export default function AppLoading() {
  return <PageLoading label="데이터를 불러오는 중..." />;
}
