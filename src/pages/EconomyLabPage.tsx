import { PageHeader } from '../components/PageState';
import { EconomyLabOverview } from '../EconomyLabOverview';

export function EconomyLabPage() {
  return (
    <div>
      <PageHeader
        title="Local economy lab"
        description="Simulated Explorer Coin observation and guarded simulation decisions. This development-only lab does not authorize public utility, mJDQ conversion or chain transactions."
      />
      <EconomyLabOverview />
    </div>
  );
}
