export type Gender = 'male' | 'female';

const FEMALE_ENDINGS = ['ita', 'ina', 'eta', 'isa', 'ela', 'ora', 'ura', 'ara', 'ana', 'ola', 'lla', 'ia', 'ra', 'sa', 'na', 'ta', 'a'];

export function resolveGender(gender?: string | null, name?: string): Gender {
  if (gender) {
    const g = gender.toLowerCase();
    if (g === 'male' || g === 'm') return 'male';
    if (g === 'female' || g === 'f') return 'female';
  }
  if (name) {
    const first = name.trim().toLowerCase().split(' ')[0];
    for (const end of FEMALE_ENDINGS) {
      if (first.endsWith(end) && first.length > end.length + 1) return 'female';
    }
  }
  return 'male';
}
