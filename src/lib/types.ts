export type Line = {
  ['الشخصية']: string;
  ['النص']: string;
  ['النبرة']: string;
  ['المكان']: string;
  ['الخلفية الصوتية']: string;
  ['رقم الصفحة']: number;
  ['رقم النص']: number;
}

export type Sheet = Line[];

export type SheetFile = {
  pdfFilename: string;
  sheet: Sheet;
}

export type Summary = string;