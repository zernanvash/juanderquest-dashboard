import { Link } from '../router';
import { PageHeader } from '../components/PageState';

export function NotFoundPage() {
  return (
    <div>
      <PageHeader title="Page not found" description="This administration route does not exist or is not available in this build." />
      <div className="stitch-panel page-state">
        <p className="page-state-title">Nothing is registered at this address.</p>
        <Link to="/" className="button-muted">
          Return to the operations overview
        </Link>
      </div>
    </div>
  );
}
