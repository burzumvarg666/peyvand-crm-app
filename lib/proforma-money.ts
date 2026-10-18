// Catalog prices and saved quotes remain in toman; invoice presentation is rial.
export const toRial = (toman: number) => toman * 10;
export const rial = (toman: number) => new Intl.NumberFormat('fa-IR', {maximumFractionDigits: 0}).format(toRial(toman)) + ' ریال';

export function persianIntegerWords(value: number): string {
    if (!Number.isSafeInteger(value) || value < 0) throw new RangeError('مبلغ خارج از محدودهٔ دقیق است.');
    if (value === 0) return 'صفر';
    const ones = ['', 'یک', 'دو', 'سه', 'چهار', 'پنج', 'شش', 'هفت', 'هشت', 'نه', 'ده', 'یازده', 'دوازده', 'سیزده', 'چهارده', 'پانزده', 'شانزده', 'هفده', 'هجده', 'نوزده'];
    const tens = ['', '', 'بیست', 'سی', 'چهل', 'پنجاه', 'شصت', 'هفتاد', 'هشتاد', 'نود'];
    const hundreds = ['', 'صد', 'دویست', 'سیصد', 'چهارصد', 'پانصد', 'ششصد', 'هفتصد', 'هشتصد', 'نهصد'];
    const scales = ['', 'هزار', 'میلیون', 'میلیارد', 'تریلیون', 'کوادریلیون'];
    const group = (n: number) => {
        const parts: string[] = [];
        if (n >= 100) {parts.push(hundreds[Math.floor(n / 100)]); n %= 100;}
        if (n >= 20) {parts.push(tens[Math.floor(n / 10)]); n %= 10;}
        if (n) parts.push(ones[n]);
        return parts.join(' و ');
    };
    const parts: string[] = [];
    for (let scale = 0; value > 0; scale++, value = Math.floor(value / 1000)) {
        const n = value % 1000;
        if (n) parts.unshift(group(n) + (scales[scale] ? ' ' + scales[scale] : ''));
    }
    return parts.join(' و ');
}
