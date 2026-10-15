import { PageHeader } from '../components/PageState';
import { AffiliateReviewCenter } from '../AffiliateReviewCenter';

export function AffiliatesPage() {
  return (
    <div>
      <PageHeader
        title="Affiliate applications"
        description="Review merchant affiliation requests with location, contact and audit details. Approval provisions the owner-scoped merchant workspace."
      />
      <AffiliateReviewCenter />
    </div>
  );
}
