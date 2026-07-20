/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  deleteDocument,
  getDocumentPreview,
  listDocumentChunks,
  listDocuments,
  reindexDocument,
  uploadDocument,
  type DocumentRecord,
} from "@/lib/api";

const DOC_PREVIEW_LIMIT = 5000;

const documentsQueryKey = (kbId: string) => ["documents", kbId] as const;
const documentPreviewQueryKey = (docId: string) => ["document-preview", docId] as const;
const documentChunksQueryKey = (docId: string) => ["document-chunks", docId] as const;

export type UploadQueueItem = {
  id: string;
  filename: string;
  status: "uploading" | "indexing" | "ready" | "failed";
  message?: string;
};

export function useDocumentControls({
  selectedKbId,
  refreshKbs,
  setError,
}: {
  selectedKbId: string;
  refreshKbs: () => Promise<unknown>;
  setError: (message: string | null) => void;
}) {
  const queryClient = useQueryClient();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [switchingKbId, setSwitchingKbId] = useState<string | null>(null);
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const hasActiveUpload = uploadQueue.some((item) => item.status === "uploading" || item.status === "indexing");

  const documentsQuery = useQuery({
    queryKey: documentsQueryKey(selectedKbId),
    queryFn: () => listDocuments(selectedKbId),
    enabled: Boolean(selectedKbId),
    refetchInterval: (query) => {
      const docs = query.state.data as DocumentRecord[] | undefined;
      const hasProcessingDoc = docs?.some((doc) => doc.status === "processing") ?? false;
      return hasProcessingDoc || hasActiveUpload ? 2000 : false;
    },
  });

  const docPreviewQuery = useQuery({
    queryKey: documentPreviewQueryKey(selectedDocId ?? ""),
    queryFn: () => getDocumentPreview(selectedDocId ?? "", 0, DOC_PREVIEW_LIMIT),
    enabled: Boolean(selectedDocId),
  });

  const docChunksQuery = useQuery({
    queryKey: documentChunksQueryKey(selectedDocId ?? ""),
    queryFn: () => listDocumentChunks(selectedDocId ?? ""),
    enabled: Boolean(selectedDocId),
  });

  const refreshDocs = useCallback(async (kbId: string, options: { clearSelection?: boolean } = {}) => {
    if (!kbId) {
      setSwitchingKbId(null);
      setSelectedDocId(null);
      return;
    }
    if (options.clearSelection) {
      setSelectedDocId(null);
    }
    await queryClient.invalidateQueries({ queryKey: documentsQueryKey(kbId) });
    const data = await queryClient.fetchQuery({
      queryKey: documentsQueryKey(kbId),
      queryFn: () => listDocuments(kbId),
    });
    setSwitchingKbId(null);
    return data;
  }, [queryClient]);

  useEffect(() => {
    clearDocumentSelection();
    if (!selectedKbId) {
      setSwitchingKbId(null);
    }
  }, [selectedKbId]);

  useEffect(() => {
    if (documentsQuery.error) {
      setSwitchingKbId(null);
      setError(documentsQuery.error.message);
    }
  }, [documentsQuery.error, setError]);

  useEffect(() => {
    const detailError = docPreviewQuery.error ?? docChunksQuery.error;
    if (detailError) {
      setError(detailError.message);
      toast.error("读取文档详情失败", { description: detailError.message });
    }
  }, [docChunksQuery.error, docPreviewQuery.error, setError]);

  useEffect(() => {
    if (switchingKbId && selectedKbId === switchingKbId && !documentsQuery.isPending) {
      setSwitchingKbId(null);
    }
  }, [documentsQuery.isPending, selectedKbId, switchingKbId]);

  function clearDocumentSelection() {
    setSelectedDocId(null);
  }

  function beginKbSwitch(kbId: string) {
    setSwitchingKbId(kbId);
    clearDocumentSelection();
  }

  async function onUpload(files: FileList | null) {
    if (!selectedKbId || !files?.length) return;
    const uploadItems = Array.from(files).map((file) => ({
      id: crypto.randomUUID(),
      filename: file.name,
      status: "uploading" as const,
      message: `${(file.size / 1024).toFixed(1)} KB`,
    }));
    setUploadQueue(uploadItems);
    setBusy("upload");
    setError(null);
    try {
      let uploaded = 0;
      for (const [index, file] of Array.from(files).entries()) {
        const itemId = uploadItems[index].id;
        setUploadQueue((items) =>
          items.map((item) =>
            item.id === itemId ? { ...item, status: "uploading", message: "上传中..." } : item,
          ),
        );
        const doc = await uploadDocument(selectedKbId, file);
        uploaded += 1;
        setUploadQueue((items) =>
          items.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  status: doc.status === "ready" ? "ready" : doc.status === "failed" ? "failed" : "indexing",
                  message:
                    doc.status === "ready"
                      ? `${doc.chunk_count} chunks ready`
                      : doc.status === "failed"
                        ? doc.error_message || "索引失败"
                        : "索引处理中...",
                }
              : item,
          ),
        );
        queryClient.setQueryData<DocumentRecord[]>(documentsQueryKey(selectedKbId), (items = []) => {
          const exists = items.some((item) => item.id === doc.id);
          return exists ? items.map((item) => (item.id === doc.id ? doc : item)) : [doc, ...items];
        });
      }
      toast.success("文档上传完成", { description: `${uploaded} 个文件已入库` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "上传失败";
      setUploadQueue((items) =>
        items.map((item) =>
          item.status === "uploading" || item.status === "indexing"
            ? { ...item, status: "failed", message }
            : item,
        ),
      );
      setError(message);
      toast.error("上传文档失败", { description: message });
    } finally {
      await refreshDocs(selectedKbId);
      await refreshKbs();
      setBusy(null);
    }
  }

  async function onDeleteDoc(docId: string) {
    setBusy(`delete-${docId}`);
    setError(null);
    try {
      await deleteDocument(docId);
      if (selectedDocId === docId) {
        clearDocumentSelection();
      }
      await refreshDocs(selectedKbId);
      await refreshKbs();
      toast.success("文档已删除");
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      setError(message);
      toast.error("删除文档失败", { description: message });
    } finally {
      setBusy(null);
    }
  }

  async function onReindexDoc(doc: DocumentRecord) {
    setBusy(`reindex-${doc.id}`);
    setError(null);
    queryClient.setQueryData<DocumentRecord[]>(documentsQueryKey(selectedKbId), (items = []) =>
      items.map((item) =>
        item.id === doc.id ? { ...item, status: "processing", error_message: "" } : item,
      ),
    );
    try {
      await reindexDocument(doc.id);
      await refreshDocs(selectedKbId);
      if (selectedDocId === doc.id) {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: documentPreviewQueryKey(doc.id) }),
          queryClient.invalidateQueries({ queryKey: documentChunksQueryKey(doc.id) }),
        ]);
      }
      toast.success("重新索引完成", { description: doc.filename });
    } catch (err) {
      const message = err instanceof Error ? err.message : "重新索引失败";
      setError(message);
      toast.error("重新索引失败", { description: message });
      await refreshDocs(selectedKbId);
    } finally {
      setBusy(null);
    }
  }

  function onInspectDoc(doc: DocumentRecord) {
    if (selectedDocId === doc.id) {
      clearDocumentSelection();
      return;
    }
    setSelectedDocId(doc.id);
    setError(null);
  }

  async function onLoadMorePreview(docId: string) {
    const currentPreview = queryClient.getQueryData<Awaited<ReturnType<typeof getDocumentPreview>>>(
      documentPreviewQueryKey(docId),
    );
    if (!currentPreview?.next_offset) return;
    setBusy(`preview-more-${docId}`);
    setError(null);
    try {
      const nextPreview = await getDocumentPreview(docId, currentPreview.next_offset, DOC_PREVIEW_LIMIT);
      queryClient.setQueryData<Awaited<ReturnType<typeof getDocumentPreview>>>(
        documentPreviewQueryKey(docId),
        (current) =>
          current && current.doc.id === docId
          ? {
              ...nextPreview,
              text: `${current.text}${nextPreview.text}`,
            }
            : nextPreview,
      );
      toast.success("已加载更多原文", { description: `${nextPreview.text.length.toLocaleString()} chars` });
    } catch (err) {
      const message = err instanceof Error ? err.message : "加载更多原文失败";
      setError(message);
      toast.error("加载更多原文失败", { description: message });
    } finally {
      setBusy(null);
    }
  }

  const visibleDocs = selectedKbId && !switchingKbId ? (documentsQuery.data ?? []) : [];
  const isLoading = Boolean(switchingKbId) || (selectedKbId ? documentsQuery.isPending : false);

  return {
    docs: visibleDocs,
    uploadQueue,
    processingCount: visibleDocs.filter((doc) => doc.status === "processing").length,
    selectedDocId,
    docPreview: docPreviewQuery.data ?? null,
    docChunks: docChunksQuery.data ?? [],
    detailLoading: Boolean(selectedDocId) && (docPreviewQuery.isPending || docChunksQuery.isPending),
    busy,
    loading: isLoading,
    clearDocumentSelection,
    beginKbSwitch,
    refreshDocs,
    onUpload,
    onDeleteDoc,
    onReindexDoc,
    onInspectDoc,
    onLoadMorePreview,
  };
}
