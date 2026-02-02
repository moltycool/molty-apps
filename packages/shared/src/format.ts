export const formatDuration = (seconds: number): string => {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const totalMinutes = Math.round(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes}m`;
  }

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}m`;
};

export const formatDelta = (deltaSeconds: number, thresholdSeconds = 300): string => {
  if (!Number.isFinite(deltaSeconds)) {
    return "—";
  }

  if (Math.abs(deltaSeconds) < thresholdSeconds) {
    return formatDuration(0);
  }

  const sign = deltaSeconds > 0 ? "+" : "-";
  return `${sign}${formatDuration(Math.abs(deltaSeconds))}`;
};
