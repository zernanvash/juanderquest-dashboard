import { PageHeader } from '../components/PageState';
import { JuanChoiceFestivals } from '../JuanChoiceFestivals';

// Plan 94: its own page so staff find the festival list without opening JuanChoice.
export function FestivalCalendarPage() {
  return (
    <div>
      <PageHeader
        title="Festival calendar"
        description="Real festivals with checked dates. They appear on the app's Almanac; switch on the boost to make that week's JuanChoice round a Special Festival election."
      />
      <JuanChoiceFestivals />
    </div>
  );
}
