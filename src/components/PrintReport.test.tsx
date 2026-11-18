import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PrintReport } from './PrintReport';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('PrintReport', () => {
  it('renders print metadata header/footer and invokes window.print on click', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    const csvSpy = vi.fn();

    render(
      <PrintReport
        title="Crowd monitoring overview"
        orientation="landscape"
        filters={[
          { label: 'Range', value: '2026-11-01 to 2026-11-08' },
          { label: 'Empty', value: '   ' },
        ]}
        onExportCsv={csvSpy}
      />,
    );

    expect(screen.getByText('Crowd monitoring overview')).toBeTruthy();
    expect(screen.getByText(/Range: 2026-11-01 to 2026-11-08/)).toBeTruthy();
    expect(screen.queryByText(/Empty:/)).toBeNull();
    expect(screen.getAllByText('JuanderQuest — official record').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Orientation: landscape/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Print' }));
    expect(printSpy).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Export CSV' }));
    expect(csvSpy).toHaveBeenCalledTimes(1);
  });
});
