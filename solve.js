// SwiftCSV — a fast, exact drop-in for csv-reader 1.0.0.
//
// The reference reads a CSV text once, left to right, and answers
// {columns, rows, errors}. This module returns the same answer for every
// input, but reads with bulk string operations instead of one character at
// a time: unquoted fields are cut with indexOf + slice, quoted fields are
// cut at the next quote, and line breaks inside quotes are counted and
// folded with a single pass over the affected span only.
//
// The broken-row policy, reproduced exactly:
//  - a U+FEFF at the very start is dropped;
//  - a record ends at LF or CRLF; a line left with no characters is no record;
//  - outside quotes a CR not followed by LF is dropped (stray_cr);
//  - a field opening with a quote runs to the next undoubled quote, "" inside
//    it is one quote, each CRLF or lone CR inside it reads as LF; what
//    follows the closing quote up to the next comma or line break is
//    appended as it stands (quote_junk, when the field ends); a quote that
//    never closes is a literal character and the text after it is read again
//    as unquoted (unterminated_quote);
//  - a quote inside an unquoted field is a literal character;
//  - fields stay strings, never trimmed or converted;
//  - columns is the first record when header is true, else null; rows holds
//    the records after it (every record when header is false), each padded
//    (short_row, with fields: its field count) or cut (long_row, with extra:
//    the cut fields) to the first record's width;
//  - each error is {code, line, row}, in the order met, a record's short_row
//    or long_row when it ends: line the 1-based line its record starts on,
//    row its record's index in rows, null for the header.

// How a field ended: at a comma (the record goes on), at a line break or at
// the end of the text (the record ends).
const END = 0;
const COMMA = 1;
const BREAK = 2;

const QUOTE = 34; // '"'
const COMMA_CH = 44; // ','
const LF = 10; // '\n'
const CR = 13; // '\r'
const BOM = 0xFEFF;

/** csv-reader 1.0.0's answer for one case's input, {text, header}. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const len = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === BOM) pos = 1;

  // The record being read: the line it starts on and the index in rows it
  // takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function pushError(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Fold a span taken from inside a quoted field: count its line breaks
  // (each CRLF, lone CR and LF is one) into `line`, and turn every CR or
  // CRLF into a single LF. Spans without a CR or LF pass through untouched.
  function foldQuoted(span) {
    const hasCR = span.indexOf('\r') !== -1;
    const hasNL = span.indexOf('\n') !== -1;
    if (!hasCR && !hasNL) return span;
    line += span.match(/\r\n|\r|\n/g).length;
    return hasCR ? span.replace(/\r\n?/g, '\n') : span;
  }

  // Read an unquoted field starting at `pos`, appending to `head` ('' for a
  // fresh field, '"' when re-reading after an unterminated quote). Returns
  // [value, ended]. A CR not followed by LF is dropped (stray_cr).
  function readUnquoted(head) {
    let cur = pos;
    let parts = null; // segments, only once a stray CR splits the field
    for (;;) {
      // The next delimiter: the nearest of comma, LF and CR.
      let end = len;
      let kind = END;
      const c = text.indexOf(',', cur);
      if (c !== -1 && c < end) { end = c; kind = COMMA; }
      const n = text.indexOf('\n', cur);
      if (n !== -1 && n < end) { end = n; kind = BREAK; }
      const r = text.indexOf('\r', cur);
      if (r !== -1 && r < end) { end = r; kind = 3; } // CR: CRLF or stray
      if (kind === 3 && text.charCodeAt(end + 1) !== LF) {
        // A lone CR: dropped, an error, and the field goes on.
        pushError('stray_cr');
        if (parts === null) parts = [head];
        parts.push(text.slice(cur, end));
        cur = end + 1;
        continue;
      }
      let value;
      if (parts === null) {
        value = head === '' ? text.slice(cur, end) : head + text.slice(cur, end);
      } else {
        parts.push(text.slice(cur, end));
        value = parts.join('');
      }
      if (kind === COMMA) { pos = end + 1; return [value, COMMA]; }
      if (kind === BREAK) { pos = end + 1; line += 1; return [value, BREAK]; }
      if (kind === 3) { pos = end + 2; line += 1; return [value, BREAK]; } // CRLF
      pos = len;
      return [value, END];
    }
  }

  // After a quoted field closes at `pos`: a comma, a line break, the end of
  // the text, or junk appended as it stands (quote_junk when anything is
  // added to the field).
  function finishQuoted(value) {
    if (pos >= len) return [value, END];
    const c = text.charCodeAt(pos);
    if (c === COMMA_CH) {
      pos += 1;
      return [value, COMMA];
    }
    if (c === LF) {
      pos += 1;
      line += 1;
      return [value, BREAK];
    }
    if (c === CR && text.charCodeAt(pos + 1) === LF) {
      pos += 2;
      line += 1;
      return [value, BREAK];
    }
    // Junk follows the closing quote: read it as unquoted, appended as it
    // stands. Anything added (stray CRs add nothing) is quote_junk.
    const junk = readUnquoted(value);
    if (junk[0].length > value.length) pushError('quote_junk');
    return junk;
  }

  // Read a quoted field whose opening quote is at `pos`. Returns
  // [value, ended]. A quote that never closes is a literal character, and
  // the text after it is read again as unquoted (unterminated_quote).
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let cur = pos + 1; // past the opening quote
    let parts = null; // spans, only once a doubled quote appears
    for (;;) {
      const q = text.indexOf('"', cur);
      if (q === -1) {
        // The quote never closes: it is a literal character, and the text
        // after it is read again as unquoted. The line count goes back to
        // where the quoted field opened.
        pos = open + 1;
        line = openLine;
        pushError('unterminated_quote');
        return readUnquoted('"');
      }
      if (text.charCodeAt(q + 1) === QUOTE) {
        // A doubled quote: the span so far plus one literal quote, then on.
        if (parts === null) parts = [];
        parts.push(foldQuoted(text.slice(cur, q)));
        parts.push('"');
        cur = q + 2;
        continue;
      }
      // The closing quote.
      let value;
      if (parts === null) {
        value = foldQuoted(text.slice(cur, q));
      } else {
        parts.push(foldQuoted(text.slice(cur, q)));
        value = parts.join('');
      }
      pos = q + 1;
      return finishQuoted(value);
    }
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      const c = text.charCodeAt(pos);
      if (c === LF) {
        pos += 1;
        line += 1;
      } else if (c === CR && text.charCodeAt(pos + 1) === LF) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === QUOTE;
      const field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field[0]);
      ended = field[1];
    } while (ended === COMMA);

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
