import { PageHeader } from '../components/PageState';
import { JuanChoiceOverviewPanel } from '../components/JuanChoiceOverviewPanel';
import { JuanChoiceAdmin } from '../JuanChoiceAdmin';

export function JuanChoicePage() {
  return (
    <div>
      <PageHeader
        title="JuanChoice"
        description="Free destination spotlight voting — the only active community voting engine. Schedules, candidates, promotion assessments and previous results."
      />
      <JuanChoiceOverviewPanel />
      <JuanChoiceAdmin />
    </div>
  );
}
