// `@types/pdf-parse` only types the package's main export. We import the
// inner module (`pdf-parse/lib/pdf-parse.js`) to skip a debug branch in
// the package's index that reads a test PDF off disk on import, so we
// declare the same shape here.
declare module 'pdf-parse/lib/pdf-parse.js' {
  import pdfParse from 'pdf-parse';
  export default pdfParse;
}
