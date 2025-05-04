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

export type PDFJs = { GlobalWorkerOptions: any; getDocument: any; default?: any; AbortException?: any; AnnotationEditorLayer?: any; AnnotationEditorParamsType?: any; AnnotationEditorType?: any; AnnotationEditorUIManager?: any; AnnotationLayer?: any; AnnotationMode?: any; AnnotationType?: any; build?: any; ColorPicker?: any; createValidAbsoluteUrl?: any; DOMSVGFactory?: any; DrawLayer?: any; FeatureTest?: any; fetchData?: any; getFilenameFromUrl?: any; getPdfFilenameFromUrl?: any; getUuid?: any; getXfaPageViewport?: any; ImageKind?: any; InvalidPDFException?: any; isDataScheme?: any; isPdfFile?: any; isValidExplicitDest?: any; MathClamp?: any; noContextMenu?: any; normalizeUnicode?: any; OPS?: any; OutputScale?: any; PasswordResponses?: any; PDFDataRangeTransport?: any; PDFDateString?: any; PDFWorker?: any; PermissionFlag?: any; PixelsPerInch?: any; RenderingCancelledException?: any; ResponseException?: any; setLayerDimensions?: any; shadow?: any; SignatureExtractor?: any; stopEvent?: any; SupportedImageMimeTypes?: any; TextLayer?: any; TouchManager?: any; Util?: any; VerbosityLevel?: any; version?: any; XfaLayer?: any; };