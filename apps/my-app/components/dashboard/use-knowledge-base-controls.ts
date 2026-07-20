"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { useDashboard } from "@/components/dashboard/dashboard-provider";
import { createKnowledgeBase, deleteKnowledgeBase } from "@/lib/api";

export function useKnowledgeBaseControls({
  setError,
  onDeleted,
}: {
  setError: (message: string | null) => void;
  onDeleted?: () => void;
}) {
  const { kbs, selectedKbId, selectedKb, kbError, refreshKbs, setSelectedKbId } = useDashboard();
  const [kbName, setKbName] = useState("");
  const [kbDesc, setKbDesc] = useState("");
  const [deleteKbConfirmId, setDeleteKbConfirmId] = useState<string | null>(null);
  const [deleteKbConfirmName, setDeleteKbConfirmName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (kbError) {
      setError(kbError);
    }
  }, [kbError, setError]);

  async function onCreateKb(event: FormEvent) {
    event.preventDefault();
    if (!kbName.trim()) return;
    setBusy("create-kb");
    setError(null);
    try {
      const kb = await createKnowledgeBase(kbName.trim(), kbDesc.trim());
      setKbName("");
      setKbDesc("");
      await refreshKbs();
      setSelectedKbId(kb.id);
      toast.success("知识库已创建", { description: kb.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : "创建失败";
      setError(message);
      toast.error("创建知识库失败", { description: message });
    } finally {
      setBusy(null);
    }
  }

  function onRequestDeleteKb() {
    if (!selectedKb) return;
    setError(null);
    setDeleteKbConfirmId(selectedKb.id);
    setDeleteKbConfirmName("");
    toast.info("请输入知识库名称确认删除", { description: selectedKb.name });
  }

  async function onDeleteKb() {
    if (!selectedKb) return;
    if (deleteKbConfirmName !== selectedKb.name) {
      const message = "请输入完整知识库名称后再删除。";
      setError(message);
      toast.error("删除确认失败", { description: message });
      return;
    }
    setBusy(`delete-kb-${selectedKb.id}`);
    setError(null);
    try {
      await deleteKnowledgeBase(selectedKb.id);
      setSelectedKbId("");
      setDeleteKbConfirmId(null);
      setDeleteKbConfirmName("");
      onDeleted?.();
      await refreshKbs();
      toast.success("知识库已删除", { description: selectedKb.name });
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除知识库失败";
      setError(message);
      toast.error("删除知识库失败", { description: message });
    } finally {
      setBusy(null);
    }
  }

  function onCancelDeleteKb() {
    setDeleteKbConfirmId(null);
    setDeleteKbConfirmName("");
  }

  return {
    kbs,
    selectedKb,
    selectedKbId,
    kbName,
    kbDesc,
    busy,
    deleteKbConfirmId,
    deleteKbConfirmName,
    setKbName,
    setKbDesc,
    setSelectedKbId,
    setDeleteKbConfirmName,
    onCreateKb,
    onRequestDeleteKb,
    onDeleteKb,
    onCancelDeleteKb,
    refreshKbs,
  };
}
