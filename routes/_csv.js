// Tiny dependency-free CSV writer — avoids pulling in another npm package for one export endpoint.
class Parser {
  escape(val) {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  toCsv(header, rows) {
    const lines = [header.map((h) => this.escape(h)).join(',')];
    for (const row of rows) {
      lines.push(row.map((v) => this.escape(v)).join(','));
    }
    return lines.join('\r\n');
  }
}

module.exports = { Parser };
