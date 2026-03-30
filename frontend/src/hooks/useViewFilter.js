import { useState, useMemo } from 'react';
import { DEFAULT_FILTERS } from '../components/clips/IterationFilter';
import { IDENTITY_FIELDS, LOCATION_FIELDS, MOTION_FIELDS } from '../constants';

function sumFields(scoreGroup, fields) {
  if (!scoreGroup) return null;
  return fields.reduce((s, f) => s + (scoreGroup[f.key] || 0), 0);
}

export function useViewFilter(iterations) {
  const [viewMode, setViewMode] = useState('lineage');
  const [filters, setFilters] = useState({ ...DEFAULT_FILTERS });
  const [showComparison, setShowComparison] = useState(false);
  const [comparedIds, setComparedIds] = useState([]);
  const [comparisonPreselect, setComparisonPreselect] = useState(null);

  const filteredIterations = useMemo(() => {
    if (!iterations) return [];
    const hasAnyFilter = Object.values(filters).some(v => v !== null);
    if (!hasAnyFilter) return iterations;

    const hasAnyScoreFilter = filters.scoreMin !== null || filters.scoreMax !== null
      || filters.identityMin !== null || filters.locationMin !== null || filters.motionMin !== null;

    return iterations.filter(iter => {
      const ev = iter.evaluation;
      const scores = ev?.scores;
      const isUnevaluated = !ev || !scores;

      if (isUnevaluated && hasAnyScoreFilter) return false;

      if (filters.scoreMin !== null && (isUnevaluated || (scores.grand_total ?? 0) < filters.scoreMin)) return false;
      if (filters.scoreMax !== null && (isUnevaluated || (scores.grand_total ?? 0) > filters.scoreMax)) return false;

      if (filters.identityMin !== null) {
        const total = sumFields(scores?.identity, IDENTITY_FIELDS);
        if (total === null || total < filters.identityMin) return false;
      }
      if (filters.locationMin !== null) {
        const total = sumFields(scores?.location, LOCATION_FIELDS);
        if (total === null || total < filters.locationMin) return false;
      }
      if (filters.motionMin !== null) {
        const total = sumFields(scores?.motion, MOTION_FIELDS);
        if (total === null || total < filters.motionMin) return false;
      }

      if (filters.rope !== null) {
        if ((ev?.attribution?.rope || null) !== filters.rope) return false;
      }

      if (filters.source !== null) {
        if ((ev?.scoring_source || null) !== filters.source) return false;
      }

      if (filters.tag !== null) {
        const tags = iter.tags || [];
        if (!tags.some(t => t.toLowerCase().includes(filters.tag.toLowerCase()))) return false;
      }

      return true;
    });
  }, [iterations, filters]);

  return {
    viewMode,
    setViewMode,
    filters,
    setFilters,
    filteredIterations,
    showComparison,
    setShowComparison,
    comparedIds,
    setComparedIds,
    comparisonPreselect,
    setComparisonPreselect,
  };
}
