import { useState, useEffect } from 'react';
import { format, isValid } from 'date-fns';
import {
  CalendarIcon,
  XMarkIcon,
  ArrowRightIcon,
  ExclamationCircleIcon,
} from '@heroicons/react/24/outline';

/**
 * DateRangePicker — custom date & time range selector.
 * Uses separate date + time inputs for consistent cross-browser styling.
 */
export default function DateRangePicker({ startDate, endDate, onChange, onClear }) {
  const [isOpen, setIsOpen] = useState(false);
  const [error, setError] = useState('');

  const toDateStr = (date) => (date && isValid(date) ? format(date, 'yyyy-MM-dd') : '');
  const toTimeStr = (date) => (date && isValid(date) ? format(date, 'HH:mm') : '00:00');

  const [startDateStr, setStartDateStr] = useState(() => toDateStr(startDate));
  const [startTimeStr, setStartTimeStr] = useState(() => toTimeStr(startDate));
  const [endDateStr, setEndDateStr] = useState(() => toDateStr(endDate));
  const [endTimeStr, setEndTimeStr] = useState(() => toTimeStr(endDate));

  // Sync local state when props change (e.g. after clear)
  useEffect(() => {
    setStartDateStr(toDateStr(startDate));
    setStartTimeStr(toTimeStr(startDate));
    setEndDateStr(toDateStr(endDate));
    setEndTimeStr(toTimeStr(endDate));
  }, [startDate, endDate]);

  const buildDate = (dateStr, timeStr) => {
    if (!dateStr) return null;
    const dt = new Date(`${dateStr}T${timeStr || '00:00'}`);
    return isValid(dt) ? dt : null;
  };

  const handleApply = () => {
    setError('');
    const start = buildDate(startDateStr, startTimeStr);
    const end = buildDate(endDateStr, endTimeStr);

    if (!start || !end) {
      setError('Both start and end are required.');
      return;
    }
    if (start >= end) {
      setError('Start must be before end.');
      return;
    }

    onChange(start, end);
    setIsOpen(false);
  };

  const handleClear = () => {
    setStartDateStr('');
    setStartTimeStr('00:00');
    setEndDateStr('');
    setEndTimeStr('23:59');
    setError('');
    onClear();
    setIsOpen(false);
  };

  const isActive = !!(startDate && endDate);

  const triggerLabel = isActive
    ? `${format(startDate, 'MMM d, yyyy HH:mm')} – ${format(endDate, 'MMM d, yyyy HH:mm')}`
    : 'Custom Range';

  return (
    <div className="relative">
      {/* Trigger button */}
      <button
        onClick={() => {
          setError('');
          setIsOpen((o) => !o);
        }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
          isActive
            ? 'bg-primary-600 text-white border border-primary-500'
            : 'bg-dark-800 border border-dark-700 text-dark-400 hover:text-dark-200 hover:border-dark-600'
        }`}
        title={isActive ? triggerLabel : 'Select custom date & time range'}
      >
        <CalendarIcon className="w-3.5 h-3.5 flex-shrink-0" />
        <span className="hidden sm:inline max-w-[260px] truncate">{triggerLabel}</span>
        <span className="sm:hidden">Custom</span>
        {isActive && (
          <XMarkIcon
            className="w-3 h-3 flex-shrink-0 ml-0.5 opacity-70 hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              handleClear();
            }}
          />
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />

          {/* Dropdown panel */}
          <div className="absolute right-0 top-full mt-2 z-20 bg-dark-800 border border-dark-700 rounded-xl shadow-2xl p-4 w-[360px]">
            <p className="text-xs font-semibold text-dark-300 uppercase tracking-wide mb-3">
              Custom Date Range
            </p>

            {/* Start / End side-by-side */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
              {/* Start */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-dark-500 uppercase tracking-wide">
                  Start
                </p>
                <input
                  type="date"
                  value={startDateStr}
                  onChange={(e) => setStartDateStr(e.target.value)}
                  className="input-field text-xs py-1.5 px-2"
                />
                <input
                  type="time"
                  value={startTimeStr}
                  onChange={(e) => setStartTimeStr(e.target.value)}
                  className="input-field text-xs py-1.5 px-2"
                />
              </div>

              {/* Arrow separator */}
              <div className="flex items-center justify-center pt-7">
                <ArrowRightIcon className="w-3.5 h-3.5 text-dark-600" />
              </div>

              {/* End */}
              <div className="space-y-1.5">
                <p className="text-[10px] font-medium text-dark-500 uppercase tracking-wide">End</p>
                <input
                  type="date"
                  value={endDateStr}
                  onChange={(e) => setEndDateStr(e.target.value)}
                  className="input-field text-xs py-1.5 px-2"
                />
                <input
                  type="time"
                  value={endTimeStr}
                  onChange={(e) => setEndTimeStr(e.target.value)}
                  className="input-field text-xs py-1.5 px-2"
                />
              </div>
            </div>

            {/* Validation error */}
            {error && (
              <div className="flex items-center gap-1.5 mt-3 text-xs text-red-400">
                <ExclamationCircleIcon className="w-3.5 h-3.5 flex-shrink-0" />
                {error}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-2 mt-4 pt-3 border-t border-dark-700">
              <button
                onClick={handleApply}
                disabled={!startDateStr || !endDateStr}
                className="flex-1 py-1.5 text-xs font-medium rounded-lg bg-primary-600 text-white hover:bg-primary-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Apply
              </button>
              <button
                onClick={handleClear}
                className="px-4 py-1.5 text-xs font-medium rounded-lg bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors"
              >
                Clear
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
