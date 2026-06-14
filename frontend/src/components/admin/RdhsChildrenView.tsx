/**
 * RDHS Children – read-only list of children in district.
 * RDHS cannot register, add measurements, or modify children.
 */
import { useState, useEffect } from 'react';
import { RefreshCw } from 'lucide-react';
import { childrenAPI } from '../../services/api';
import { ChildProfileCard } from '../ChildProfileCard';
import { PaginationControls } from '../PaginationControls';

export function RdhsChildrenView() {
  const PAGE_SIZE = 12;
  const [children, setChildren] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const load = () => {
    setError('');
    setLoading(true);
    childrenAPI
      .list({})
      .then((res) => {
        if (res.data?.status === 'success') {
          setChildren(res.data.children || []);
          setCurrentPage(1);
        }
      })
      .catch((err) => setError(err.response?.data?.message || 'Failed to load children'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold text-gray-900">Children (Read-only)</h2>
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">Loading children...</p>
        </div>
      </div>
    );
  }

  const pageCount = Math.max(1, Math.ceil(children.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, pageCount);
  const paginatedChildren = children.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h2 className="text-2xl font-bold text-gray-900">District Children (Read-only)</h2>
        <button
          type="button"
          onClick={load}
          className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>
      <p className="text-sm text-gray-600">View only. You cannot register children or add measurements.</p>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200 p-6">
          <h3 className="text-lg font-bold text-gray-900">Children ({children.length})</h3>
          {children.length > 0 && (
            <p className="mt-1 text-sm text-gray-500">
              Showing {(safePage - 1) * PAGE_SIZE + 1}-{Math.min(safePage * PAGE_SIZE, children.length)} of {children.length} children
            </p>
          )}
        </div>
        {children.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No children in your district.</div>
        ) : (
          <>
            <div className="grid grid-cols-1 items-stretch gap-6 p-6 md:grid-cols-2 lg:grid-cols-4">
              {paginatedChildren.map((child) => (
                <ChildProfileCard key={child.id} child={child} accent="teal" />
              ))}
            </div>
            <PaginationControls
              currentPage={safePage}
              totalItems={children.length}
              itemsPerPage={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </div>
    </div>
  );
}
