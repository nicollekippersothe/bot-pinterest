/**
 * Parser de CSV mínimo, suficiente para os exports do painel de afiliados e
 * para o datafeed da Shopee: campos entre aspas, aspas escapadas (`""`),
 * vírgulas e quebras de linha dentro do campo, e BOM no início do arquivo.
 */
export function parseCsv(text: string): string[][] {
  const clean = text.replace(/^﻿/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];

    if (quoted) {
      if (char === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') quoted = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Converte as linhas em objetos usando a primeira linha como cabeçalho. */
export function parseCsvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  const header = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const record: Record<string, string> = {};
    header.forEach((key, index) => {
      record[key] = (row[index] ?? '').trim();
    });
    return record;
  });
}

/** "55,00" / "R$ 1.234,56" -> 1234.56 (formato brasileiro). */
export function parseBRNumber(value: string | undefined): number {
  if (!value) return 0;
  const cleaned = value.replace(/[^\d,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number.parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * "120.00" -> 120 (formato internacional, usado pelo datafeed da Shopee).
 * Não confundir com `parseBRNumber`: aqui o ponto é decimal, não milhar.
 */
export function parseNumber(value: string | undefined): number {
  const parsed = Number.parseFloat((value ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** "6,5%" -> 6.5 */
export function parsePercent(value: string | undefined): number {
  return parseBRNumber(value?.replace('%', ''));
}

/**
 * O painel mostra vendas como texto aproximado ("20mil+", "2 mil+", "28").
 * Devolve uma estimativa numérica só para ordenação.
 */
export function parseSales(value: string | undefined): number {
  if (!value) return 0;
  const normalized = value.toLowerCase().replace(/\s+/g, '');
  const number = parseBRNumber(normalized.replace(/mil\+?/g, '').replace(/\+/g, ''));
  return normalized.includes('mil') ? Math.round(number * 1000) : Math.round(number);
}
