import { PageHeader } from '../components/PageState';
import { WebAnalyticsDashboard } from '../WebAnalyticsDashboard';

export function AnalyticsPage() {
  return (
    <div>
      <PageHeader
        title="Web analytics"
        description="Counters sourced from web telemetry only. This is not a complete picture of mobile activity, and synthetic QA traffic is excluded by the API."
      />
      <WebAnalyticsDashboard />
    </div>
  );
}
