import { PageHeader } from '../components/PageState';
import { GovernanceControlCenter } from '../GovernanceControlCenter';

export function GovernancePage() {
  return (
    <div>
      <PageHeader
        title="Governance archive"
        description="Historical off-chain governance records retained for inspection. JuanChoice is the only active voting engine; legacy mutation controls are disabled here."
      />
      <GovernanceControlCenter readOnly />
    </div>
  );
}
