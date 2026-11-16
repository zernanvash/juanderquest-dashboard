import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AdminPagination, AdminSearchBar } from './AdminSearchBar';

describe('AdminSearchBar & AdminPagination', () => {
  it('filters and clears search queries and displays result counts', () => {
    const onSearchChange = vi.fn();
    render(
      <AdminSearchBar
        search="bolinao"
        onSearchChange={onSearchChange}
        placeholder="Search spots…"
        resultCount={3}
        totalCount={12}
      />,
    );

    expect(screen.getByText(/3 of 3 \(12 total\)/)).toBeInTheDocument();
    const clearBtn = screen.getByRole('button', { name: 'Clear search' });
    fireEvent.click(clearBtn);
    expect(onSearchChange).toHaveBeenCalledWith('');
  });

  it('paginates when totalPages > 1', () => {
    const onPageChange = vi.fn();
    render(<AdminPagination page={1} totalPages={3} totalItems={65} onPageChange={onPageChange} />);
    expect(screen.getByText(/Page 1 of 3 · 65 items/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    expect(onPageChange).toHaveBeenCalledWith(2);
  });
});
