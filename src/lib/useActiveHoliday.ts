import { useMemo } from 'react';
import { useBranding } from './useBranding';
import { getActiveHoliday, DEFAULT_HOLIDAY_CONFIG, type ActiveHoliday } from './holidayTheme';

export function useActiveHoliday(): ActiveHoliday | null {
  const branding = useBranding();
  return useMemo(() => {
    const config = (branding as any).holiday ?? DEFAULT_HOLIDAY_CONFIG;
    return getActiveHoliday(new Date(), config);
  }, [branding]);
}
