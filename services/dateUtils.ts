
export const formatDate = (date: Date | number) => {
  return new Intl.DateTimeFormat('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'Africa/Harare'
  }).format(typeof date === 'number' ? new Date(date) : date).replace(/\./g, '');
};

export const parseDateStr = (dateStr: string): Date | null => {
  try {
    const parts = dateStr.split(' ');
    if (parts.length !== 3) return null;
    const day = parseInt(parts[0]);
    const monthStr = parts[1];
    const year = parseInt(parts[2]);
    const months: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
    };
    return new Date(Date.UTC(year, months[monthStr], day, 0, 0, 0));
  } catch (e) {
    return null;
  }
};
