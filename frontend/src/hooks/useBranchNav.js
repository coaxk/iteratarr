import { useState, useEffect } from 'react';
import { useClipBranches } from './useQueries';

export function useBranchNav(clipId) {
  const { data: branches, refetch: refetchBranches } = useClipBranches(clipId);
  const [selectedBranchId, setSelectedBranchId] = useState(null);
  const [drillBranchId, setDrillBranchId] = useState(null);
  const [managingBranchId, setManagingBranchId] = useState(null);
  const [showAnalytics, setShowAnalytics] = useState(false);

  // When drilling into a branch, sync selectedBranchId
  useEffect(() => {
    if (drillBranchId) {
      setSelectedBranchId(drillBranchId);
    }
  }, [drillBranchId]);

  // Auto-select the most recently active branch when branches load
  useEffect(() => {
    if (branches?.length > 0 && selectedBranchId === null && drillBranchId) {
      const active = branches
        .filter(b => b.status === 'active' || b.status === 'locked')
        .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      if (active.length > 0) {
        setSelectedBranchId(active[0].id);
      }
    }
  }, [branches]);

  /** Sets both drillBranchId and selectedBranchId in one call */
  const drillIntoBranch = (branchId) => {
    setDrillBranchId(branchId);
    setSelectedBranchId(branchId);
  };

  return {
    branches,
    refetchBranches,
    selectedBranchId,
    setSelectedBranchId,
    drillBranchId,
    setDrillBranchId,
    drillIntoBranch,
    managingBranchId,
    setManagingBranchId,
    showAnalytics,
    setShowAnalytics,
  };
}
