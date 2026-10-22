import { useCallback, useState } from 'react';
import { PowerOff } from 'lucide-react';
import { PageHeader } from '../components/PageState';
import { JuanChoiceOverviewPanel } from '../components/JuanChoiceOverviewPanel';
import { JuanChoiceAdmin } from '../JuanChoiceAdmin';

export function JuanChoicePage() {
  const [disabled, setDisabled] = useState(false);
  const onFeatureDisabled = useCallback(() => setDisabled(true), []);
  return (
    <div>
      <PageHeader
        title="JuanChoice"
        description="Free destination spotlight voting — the only active community voting engine. Schedules, candidates, promotion assessments and previous results."
      />
      {disabled ? (
        <div className="jc-off" role="status">
          <PowerOff size={20} aria-hidden="true" />
          <div>
            <strong>JuanChoice is turned off on this server</strong>
            <p>Rounds, schedules and campaigns can be managed once the server runs with <code>JUANCHOICE_ENABLED=true</code>. Nothing is lost while it is off.</p>
          </div>
        </div>
      ) : (
        <>
          <JuanChoiceOverviewPanel onFeatureDisabled={onFeatureDisabled} />
          <JuanChoiceAdmin />
        </>
      )}
    </div>
  );
}
