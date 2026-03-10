'use client';

const CHICAGO_TIMEZONE = 'America/Chicago';

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getZonedParts(date: Date): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: CHICAGO_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    Number.parseInt(parts.find((part) => part.type === type)?.value ?? '0', 10);

  return {
    year: read('year'),
    month: read('month'),
    day: read('day'),
    hour: read('hour'),
    minute: read('minute'),
    second: read('second'),
  };
}

function chicagoDateTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  let guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const zoned = getZonedParts(guess);
    const desiredMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const actualMs = Date.UTC(
      zoned.year,
      zoned.month - 1,
      zoned.day,
      zoned.hour,
      zoned.minute,
      zoned.second,
      0,
    );
    const diffMs = desiredMs - actualMs;
    if (diffMs === 0) break;
    guess = new Date(guess.getTime() + diffMs);
  }

  return guess;
}

export function buildSprintDeadlineInChicago(anchorDateIso: string, dueTime: string): string {
  const anchorDate = new Date(anchorDateIso);
  const [hours, minutes] = dueTime.split(':').map((part) => Number.parseInt(part, 10));
  return chicagoDateTimeToUtc(
    anchorDate.getUTCFullYear(),
    anchorDate.getUTCMonth() + 1,
    anchorDate.getUTCDate(),
    Number.isFinite(hours) ? hours : 23,
    Number.isFinite(minutes) ? minutes : 59,
  ).toISOString();
}
