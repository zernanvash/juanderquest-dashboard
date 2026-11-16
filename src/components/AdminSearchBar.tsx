import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

export interface AdminSearchFilter {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
}

interface AdminSearchBarProps {
  value?: string;
  search?: string;
  onChange?: (value: string) => void;
  onSearchChange?: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  totalCount: number;
  filteredCount?: number;
  resultCount?: number;
  shownCount?: number;
  itemLabel?: string;
  filters?: AdminSearchFilter[];
  children?: ReactNode;
}

export function AdminSearchBar({
  value,
  search,
  onChange,
  onSearchChange,
  placeholder = 'Search…',
  ariaLabel = 'Search items',
  totalCount,
  filteredCount,
  resultCount,
  shownCount,
  itemLabel = 'items',
  filters = [],
  children,
}: AdminSearchBarProps) {
  const activeValue = value ?? search ?? '';
  const handleChange = onChange ?? onSearchChange ?? (() => {});
  const activeFiltered = filteredCount ?? resultCount ?? totalCount;
  const visible = shownCount ?? activeFiltered;
  const countText =
    activeFiltered === totalCount
      ? `${visible} of ${totalCount}`
      : `${visible} of ${activeFiltered} (${totalCount} total)`;

  return (
    <div className="stitch-panel admin-search-bar">
      <div className="admin-search-controls">
        <div className="admin-search-input-wrap">
          <Search size={15} className="admin-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="admin-search-input"
            value={activeValue}
            onChange={(event) => handleChange(event.target.value)}
            placeholder={placeholder}
            aria-label={ariaLabel}
          />
          {activeValue ? (
            <button
              type="button"
              className="admin-search-clear"
              onClick={() => handleChange('')}
              aria-label="Clear search"
            >
              <X size={14} aria-hidden="true" />
            </button>
          ) : null}
        </div>
        {filters.map((filter) => (
          <label key={filter.id} className="admin-search-filter">
            <span>{filter.label}</span>
            <select value={filter.value} onChange={(event) => filter.onChange(event.target.value)}>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        ))}
        {children}
      </div>
      <span className="admin-search-count" aria-live="polite">
        {countText} {itemLabel}
      </span>
    </div>
  );
}

interface AdminPaginationProps {
  page: number;
  totalPages: number;
  totalItems?: number;
  onPageChange: (page: number) => void;
}

export function AdminPagination({ page, totalPages, totalItems, onPageChange }: AdminPaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className="admin-pagination pagination" role="navigation" aria-label="List pagination">
      <span>
        Page {page} of {totalPages}
        {typeof totalItems === 'number' ? ` · ${totalItems} items` : ''}
      </span>
      <div className="admin-pagination-actions">
        <button
          type="button"
          className="button button-secondary button-muted"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
        Previous
      </button>
      <span className="pagination-status">
        Page {page} of {totalPages}
      </span>
        <button
          type="button"
          className="button button-secondary button-muted"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}

export function useClientPagination<T>(items: T[], pageSize = 24) {
  const [page, setPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(items.length / pageSize));

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const pageItems = useMemo(() => {
    const start = (page - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, page, pageSize]);

  return { page, setPage, totalPages, pageItems };
}
