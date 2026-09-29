import { useCallback, useEffect, useRef, useState } from "react";
import type { PdfDocument } from "../lib/pdf";
import { extractPage, loadPdf } from "../lib/pdf";
import { createSamplePdf } from "../lib/samplePdf";
import type { ReaderPage } from "../types";

export function usePdfReader() {
  const pdfRef = useRef<PdfDocument | null>(null);
  const pagesCacheRef = useRef<Map<number, ReaderPage>>(new Map());
  const [fileName, setFileName] = useState("Open a PDF to begin");
  const [documentId, setDocumentId] = useState("");
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [page, setPage] = useState<ReaderPage | null>(null);
  const [pdf, setPdf] = useState<PdfDocument | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initPdf = useCallback(async (source: File | Uint8Array, name: string) => {
    setLoading(true);
    setError(null);
    pagesCacheRef.current.clear();
    try {
      if (pdfRef.current) {
        try { pdfRef.current.destroy(); } catch {}
      }
      const loadedPdf = await loadPdf(source);
      const nextDocId = crypto.randomUUID();
      pdfRef.current = loadedPdf;
      setPdf(loadedPdf);
      setDocumentId(nextDocId);
      setFileName(name.replace(/\.pdf$/i, ""));
      setPageCount(loadedPdf.numPages);
      setCurrentPage(1);

      const firstPage = await extractPage(loadedPdf, 1);
      const fullPage = { ...firstPage, id: `${nextDocId}:page:${firstPage.pageNumber}` };
      pagesCacheRef.current.set(1, fullPage);
      setPage(fullPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to open PDF");
      pdfRef.current = null;
      setPdf(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const open = useCallback(async (file: File) => {
    await initPdf(file, file.name);
  }, [initPdf]);

  const loadSample = useCallback(async () => {
    const sampleBytes = createSamplePdf();
    await initPdf(sampleBytes, "Vivido Demonstration Book (Cognitive Architecture)");
  }, [initPdf]);

  const goToPage = useCallback(async (pageNumber: number) => {
    const currentDoc = pdfRef.current;
    if (!currentDoc) return;
    const target = Math.min(Math.max(pageNumber, 1), currentDoc.numPages);
    setCurrentPage(target);

    if (pagesCacheRef.current.has(target)) {
      setPage(pagesCacheRef.current.get(target)!);
      return;
    }

    try {
      const nextPage = await extractPage(currentDoc, target);
      const fullPage = { ...nextPage, id: `${documentId}:page:${nextPage.pageNumber}` };
      pagesCacheRef.current.set(target, fullPage);
      setPage(fullPage);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to read page");
    }
  }, [documentId]);

  useEffect(() => {
    return () => {
      try { pdfRef.current?.destroy(); } catch {}
    };
  }, []);

  return {
    documentId,
    fileName,
    pageCount,
    currentPage,
    page,
    pdf,
    loading,
    error,
    open,
    loadSample,
    goToPage
  };
}
