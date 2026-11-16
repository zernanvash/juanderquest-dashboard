import { PageHeader } from '../components/PageState';
import { JuanChoicePerkControls, usePlatformStaff } from '../JuanChoicePerkControls';

export function JuanChoicePerksPage() {
  const platform = usePlatformStaff();

  return (
    <div>
      <PageHeader
        title="JuanChoice perk controls"
        description="JuanderQuest platform staff controls for live perk suspensions, normal/festival perk values, and recent changes."
      />
      {!platform ? (
        <div className="stitch-panel">
          <p className="jc-meta">Perk controls are restricted to JuanderQuest platform staff.</p>
        </div>
      ) : (
        <JuanChoicePerkControls />
      )}
    </div>
  );
}
