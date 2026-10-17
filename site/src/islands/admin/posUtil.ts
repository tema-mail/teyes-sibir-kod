// Общие мелочи раздела «Позиции»: числа, даты, топ-N и цвет места (Positions.tsx и WmMonth.tsx).
export const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(2, 4)}`;
export const num = (n: number) => n.toLocaleString('ru-RU');
export const pos = (p: number | null) => (p == null ? '–' : p.toFixed(1).replace('.', ','));
// Топ-N – как в прошлом дашборде и Вебмастере: «позиция 3» = средняя от 3,0 до 3,9, то есть топ-3 – меньше 4
export const inTop = (p: number | null, n: number) => p != null && p < n + 1;
export const cls = (p: number | null) => (p == null ? 'out' : inTop(p, 3) ? 't3' : inTop(p, 10) ? 't10' : inTop(p, 30) ? 't30' : 'out');
